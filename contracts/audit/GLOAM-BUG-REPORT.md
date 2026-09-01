# Gloam — Security Audit & Bug Report

**Target:** Gloam — ZK shielded-pool privacy protocol (shield / transfer / unshield) + sealed swaps.
**Network:** Robinhood Chain Testnet (chainId 46630), RPC `https://rpc.testnet.chain.robinhood.com`.
**Reviewer:** Duke (@dukedotsol), independent security researcher. Methodology: Kensho (authorize → recon →
analyze → prove). All testing was read-only static review, local Foundry, and RH-testnet `eth_call`. Nothing
was broadcast, no funds were moved, no live exploit was performed.
**Scope (5 workstreams):** (1) pool contract accounting, (2) circom circuits ↔ verifiers, (3) live deployment
state, (4) peripheral contracts + deploy/seed scripts, (5) off-chain client / key handling.
**Sub-reports:** `CONTRACT-FINDINGS.md`, `CIRCUIT-FINDINGS.md`, `PERIPHERAL-FINDINGS.md`, `OFFCHAIN-FINDINGS.md`.

---

## Severity summary

| ID | Severity | Status | Title |
|----|----------|--------|-------|
| H-P1 | **Critical** | LIVE (funded) | Old pool `0x4F38…` drainable via unbound `shield()`, unhardenable |
| H1 | **High** | live if swap enabled | `sealedSwap()` breaks per-asset solvency accounting → cross-asset drain |
| C1 | **High** | live config (app pool empty) | App pool `shieldVerifier == 0` → unbound `shield()` |
| M-1 | Medium | mainnet gate | Client stores note secrets + receive-tag private key in plaintext `localStorage` |
| M-2 | Medium | mainnet gate | Dev-ceremony zkeys (toxic waste → forgeable proofs) |
| M-3 | Medium | live | Client neuters swap slippage floor (`amountOutMin` clamped to `amountOut`) |
| M-4 | Medium | mainnet gate | Centralization: owner can drain / repoint verifiers / re-open unbound shield; single-step ownership |
| L-1 | Low | live | `GloamPayMemo` deanonymizes sender + unauthenticated permissionless memos |
| L-2 | Low | info | Plaintext bearer ticket; MCP raw env key (testnet); same-bundle hash pinning; stuck direct transfers |

---

## Deployment state (verified on-chain, chainId 46630)

Two funded/relevant pools exist. The app UI points at the hardened-capable pool; the **funds** are on the old one.

| Contract | Address | Live state |
|---|---|---|
| App pool `ShieldPoolPoseidon` | `0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834` | `verifier()`=DualProof `0xB077c620…` (real); `shieldVerifier()`=`0x0` (C1); `sealedSwapVerifier()`=`0x9d866ca3…` (set); deposited[]=0 (empty) |
| **Old funded pool** | `0x4F38…12D8F` | ETH 0.005 + deposited[TSLA]=deposited[AMZN]=deposited[AMD]=1e18; `verifier()`=real DualProof; `shieldVerifier()` and `swapRate()` **revert** (pre-C1, unhardenable) |
| DualProofVerifier | `0xB077c620384813bB31Bb82Cd55b63608Ac20f7eF` | real Groth16 router (unshield 5-input / transfer 4-input) |
| SealedSwapVerifier / IVerifier | `0xa06461Ec…` / `0x9D866ca3…` | real Groth16 |
| ShieldVerifier (deployed, NOT wired) | `0x3aB7f1Ab520Ad84523D271C8015567DAb84D362f` | real Groth16 |
| Poseidon2 / Poseidon3 | `0x46b33ced…` / `0x05A99a35…` | genuine circomlib (canonical test vector confirmed) |
| Old keccak pool (Phase-1) | `0x2BD98196…` | empty, `verifier()`=0, unshield/transfer revert `VerifierNotSet` — no drain |
| GloamPayMemo | `0x689e…` | event-only, no custody |
| Owner (all pools) | `0xE1B0ddF821F1faA9402b0B8C4E66B213f877e828` | EOA |

---

## Findings

### H-P1 — CRITICAL — Funded pool `0x4F38…` is drainable by any third party via unbound `shield()`, and cannot be hardened in place
**Status:** LIVE. The pool holds real seeded testnet inventory and its address is published in
`app/src/app/docs/chain/page.tsx`.

**Root cause.** `ShieldPoolPoseidon.shield()` inserts a **client-supplied commitment** into the Merkle tree
and credits `deposited[asset] += amount`, but does **not** prove that `commitment == Poseidon(secret, amount,
asset)` (that binding lives in `shieldBound()`, which requires `shieldVerifier != 0`). On the funded old pool
`0x4F38…`, `shieldVerifier()` and `swapRate()` **revert** — it predates the C1/C3 fixes, so there is no
function to set a shield verifier; it cannot be hardened in place.

**Attack (permissionless).** An attacker computes a note commitment encoding a large value,
`C = Poseidon(secret, 1e18, TSLA)`, calls `shield(TSLA, 1 wei, C)` (deposits ~nothing, inserts the
over-valued leaf), then `unshield`s 1e18 TSLA against the seeded inventory with a valid proof (the unshield
circuit proves `C` is in the tree and `C == Poseidon(secret, 1e18, TSLA)`, which holds). Cost ~1 wei;
executable by anyone, not just the owner.

**Evidence.** On-chain `eth_call`: `0x4F38…` holds ETH 0.005 + 1e18 each TSLA/AMZN/AMD, `nextIndex=8`;
`shieldVerifier()`/`swapRate()` revert. `script/SeedVaultInventory.s.sol` hardcodes this pool as
`DEFAULT_POOL`; broadcast logs confirm the seed landed here. The unbound-shield mechanism is the same C1 class
proven against the app pool.

**Impact.** Total loss of the seeded inventory to an anonymous attacker. (Testnet funds today; identical
mechanism on any real deposit.)

**Recommendation.** `emergencyWithdraw` all balances off `0x4F38…` immediately (deposited[] is tracked, so the
call succeeds). Stop seeding it; repoint `SeedVaultInventory.s.sol` and all deploy scripts to the hardened
pool (one with a working `shieldVerifier`). Never seed a pool whose `shieldVerifier == 0`. Remove the address
from public docs.

---

### H1 — HIGH — `sealedSwap()` breaks per-asset solvency accounting → cross-asset drain of honest holders
**Status:** live whenever `sealedSwapVerifier != 0` (it is set on the app pool `0xaEbB8E3b…`).
**Location:** `contracts/src/ShieldPoolPoseidon.sol` `sealedSwap()` ~L266–320; solvency gate at `unshield` L336.

**Root cause.** The pool's only solvency invariant is `deposited[asset] == Σ live note value in asset`,
maintained by `shield`/`unshield`. `sealedSwap()` spends an `assetIn` note and mints an `assetOut` note + an
`assetIn` change note but **never updates `deposited[]` for either asset**, and never checks the pool holds
any `assetOut`. It cannot: the swap amounts (`amountSwap`, `amountOut`) are **private** circuit inputs — only
`amountOutMin`, `rateIn`, `rateOut` are public (L392–402) — so the contract has no correct value to
credit/debit. After a swap, total `assetOut` claims exceed `assetOut` inventory.

**Attack (PoC-proven).** Honest LP shields 100 tokenOut. Attacker shields 100 tokenIn, `sealedSwap`s 1:1 at
the owner-approved rate into a 100-tokenOut note, then `unshield`s it — draining the LP's tokenOut deposit.
The LP's own `unshield` then reverts `InsufficientPoolBalance`. The attacker's `assetIn` is stranded
(recoverable only via `emergencyWithdraw`).

**Evidence.** Passing Foundry test `test_H1_sealedSwap_breaks_deposited_accounting` (added under
`contracts/test/`). Rated High (not Critical) because at the pinned fair rate the attacker pays real, stranded
`assetIn` (no free mint), but it is genuine cross-asset value non-conservation causing permanent third-party
fund loss + DoS.

**Recommendation.** Do not enable `sealedSwapVerifier` on a funded pool. Proper fix: make the swap amounts
public inputs and update `deposited[assetIn] -= amountSwap; deposited[assetOut] += amountOut` with a solvency
check, or back swaps with an explicit owner-funded `assetOut` inventory reserve.

---

### C1 — HIGH — App pool `shieldVerifier == 0`: unbound `shield()` path is live (pool currently empty)
**Status:** live config on `0xaEbB8E3b…`; not yet exploitable only because the pool holds 0 funds.
**Location:** `ShieldPoolPoseidon.sol` `shield()` L180–L233 vs `shieldBound()` L198–L233;
`setShieldVerifier()` L124.

**Root cause / attack.** Same unbound-commitment mechanism as H-P1: while `shieldVerifier == address(0)`,
`shield()` accepts a client-supplied commitment not bound to `amount`, so an over-valued leaf can be inserted
and later unshielded against other users' deposits. `eth_call` confirms `shieldVerifier() == 0x0` on the app
pool today.

**Recommendation.** Call `setShieldVerifier(0x3aB7f1Ab…)` (the deployed real ShieldVerifier) **before** the
pool takes any deposit. Once set, `shield()` reverts `ShieldProofRequired` and callers must use `shieldBound()`
(which proves `commitment == Poseidon(secret, amount, asset)`). Never reset it to 0 on a funded pool.

---

### M-1 — MEDIUM (mainnet gate) — Client stores note secrets + receive-tag private key in plaintext `localStorage`
**Location:** `app/src/…` note store `gloam.shield.notes.v1`; `receiveTag.ts:81` (private ECDH JWK).
All note secrets and the receive-tag private key are persisted unencrypted. Any XSS or malicious dependency
reads them, draining every note and deanonymizing the user — the single largest client-side theft vector.
**Recommendation.** Encrypt at rest with a passphrase/passkey-PRF-derived key; never persist raw secrets.

### M-2 — MEDIUM (mainnet gate) — Dev-ceremony zkeys
`PROVING_CEREMONY = "dev"`; proving/verifying keys come from a dev trusted setup. Retained toxic waste allows
forged proofs / minted notes. On-chain hash-pinning does not make dev keys safe.
**Recommendation.** Run a multi-party trusted-setup ceremony before mainnet; re-pin the production hashes.

### M-3 — MEDIUM — Client neuters the swap slippage floor
**Location:** `witness.ts:221`. The client clamps `amountOutMin` **down** to the computed `amountOut`, so the
on-chain `amountOutMin` public input always equals `amountOut` and the min-out check can never fire. Limited
under fixed-rate v0; becomes a real slippage/sandwich exposure once rates are market-driven.
**Recommendation.** Refuse (revert client-side) when the computed output is below the user's real minimum;
pass the user's actual `amountOutMin`.

### M-4 — MEDIUM (mainnet gate) — Centralization / reversible protections
The owner (single EOA) can `emergencyWithdraw` all funds, repoint any verifier (incl. to an always-true one),
and `setShieldVerifier(0)` to silently re-open the unbound C1 path (PoC
`test_owner_can_reopen_C1_by_unsetting_shield_verifier`, passing). `transferOwnership` is single-step.
**Recommendation.** For mainnet: timelock + multisig on owner ops; make the shield verifier one-way
(set-once); gate/timelock `emergencyWithdraw`; two-step ownership.

### L-1 — LOW — `GloamPayMemo` deanonymizes the sender + unauthenticated permissionless memos
**Location:** `contracts/src/GloamPayMemo.sol`; `payMemo.ts:34–40`. The `PaymentMemo` event indexes `poster`
(the sender's clear address) next to `paymentCommitment`, linking a real address to a "private" payment
(memo content itself is encrypted). Posting is permissionless, so anyone can emit a memo referencing any
commitment.
**Recommendation.** Post memos via a relayer or de-index the poster. Wallets must authenticate the memo (AEAD)
and confirm `paymentCommitment` is a real tree leaf before surfacing an "incoming payment," else spoofed-memo
griefing.

### L-2 — LOW / INFO
- Bearer ticket `gloam1.` is `base64(JSON)` with the secret in clear (by design; UI says "treat like cash") —
  prefer encrypted-share / direct-tag by default.
- `mcp/src/signer.ts:26` reads a raw env private key (testnet-only, returns null when unset) — move to a
  server wallet with policy before mainnet.
- Artifact hash-pinning is same-bundle (a bundle attacker swaps the constant too) — defense-in-depth only.
- Direct ERC-20 transfers / `receive()` desync `deposited[]` from physical balance (funds recoverable only via
  `emergencyWithdraw`; bounded, not a theft vector).

---

## Verified SOUND (checked, no issue)

**Circuits.** The three catastrophic bugs are genuinely fixed, verified at the R1CS constraint level:
(1) shield commitment now binds to the public `amount`/`asset`; (2) value-inflation-via-field-overflow closed
by `Num2Bits(128)` range checks on every amount (production `transfer.circom` = 6270 constraints vs the buggy
PoC's 5886, delta 384 = 3× the range check); (3) sealed-swap rate pinned on-chain. Value conservation, Merkle
membership, and public-input binding all sound. Public-input order/count matches the verifiers exactly
(4/5/3/9).

**Nullifier.** Derived identically as `Poseidon(secret, commitment)` in transfer, unshield, and sealedSwap
(same inputs, same order, no domain separation), matching the contract's `NoteLibPoseidon`. The shared
`spent` set therefore prevents cross-path double-spend.

**Verifiers.** All wired verifiers are real Groth16 (1.5–2 KB pairing-check bytecode; an always-true one would
be <200 B). `DualProofVerifier` routing has no proof-type confusion (input-array length is hardcoded per
entrypoint, distinct verification keys). The `I*Verifier` adapters forward proof + all public inputs faithfully
(exact length, no drop/reorder/hardcode). `Poseidon2`/`Poseidon3` are genuine circomlib (canonical test vector).

**Contract.** Nullifier lifecycle + CEI ordering are reentrancy-safe (spent set before external transfer),
root validation via permanent `knownRoots` on all spend paths, depth-20 incremental tree with correct
`TreeFull`/`ZeroLeaf`/one-shot-init handling, duplicate-commitment guard, C3 owner-pinned swap rate. The old
keccak pool `0x2BD9…` is empty with no exit path.

**Client.** Note-secret entropy is CSPRNG at full field width (31-byte field secret under the BN254 prime → no
modular bias; no `Math.random`). The unshield recipient is cryptographically bound as a circuit public signal,
so a malicious frontend cannot redirect a withdrawal; cash-out is hard-wired to the connected wallet. Proving
artifacts are SHA-256-checked before every prove. No secret is logged, put in URLs, or sent to a backend.

---

## Cross-cutting note

The **sealed-swap path is the weakest area across every layer**: H1 (contract solvency accounting), the
circuit L1 (missing `secret != 0` in `sealedSwap.circom`), and M-3 (client slippage clamp). Recommend keeping
swaps disabled (`sealedSwapVerifier = 0`) until all three are addressed.

## Prioritized remediation
1. **Now:** `emergencyWithdraw` off `0x4F38…`; stop seeding it (H-P1).
2. **Before any funded pool / demo:** `setShieldVerifier(real)` on the app pool (C1); `setSealedSwapVerifier(0)`
   (H1); repoint seed/deploy scripts to the hardened pool; add a deploy-time guard rejecting scaffold verifiers.
3. **Before mainnet:** encrypt client secrets at rest (M-1); real trusted-setup ceremony (M-2); fix the slippage
   clamp (M-3); timelock/multisig + one-way shield verifier + gated `emergencyWithdraw` (M-4); de-index the
   pay-memo poster (L-1); implement proper sealed-swap accounting before re-enabling swaps.

*Prepared by Duke (@dukedotsol). Read-only review; no transactions broadcast.*
