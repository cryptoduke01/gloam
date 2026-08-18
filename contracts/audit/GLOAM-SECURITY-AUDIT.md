# Gloam ShieldPool — Security Audit (self-assessment)

**Researcher:** Duke (@dukedotsol) · Kensho playbook
**Date:** 2026-08-18
**Scope:** `contracts/` — `ShieldPoolPoseidon.sol`, `ShieldPool.sol`, `GloamPayMemo.sol`,
`src/verifiers/*`, `src/lib/*`, `circuits/{unshield,transfer,sealedSwap,common}/*.circom`
**Chain:** Robinhood testnet (chainId 46630)
**Authorization:** Own deployment.
**Verification:** Local fork / `eth_call` / circom witness generation / Foundry unit tests.
No mainnet or live-network state was touched. Nothing was deployed.

## Live state at time of audit

| Contract | Address | Note |
|---|---|---|
| Poseidon ShieldPool (production) | `0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F` | verifier + sealedSwapVerifier BOTH set; ~0.005 ETH; 8 leaves |
| Unshield/transfer verifier (DualProof) | `0x4B0D0BD35C88F06A552439D5eBbB71A2FeF0949C` | real Groth16, field+length checks OK |
| SealedSwap verifier | `0x68C28ECD40320038bF8DE34Bb02064e12f602371` | real Groth16, 9 inputs |
| Keccak Phase-1 pool | `0x2BD98196D90AB45D58843B4c8B8809aa34343d35` | verifier = address(0) |

The production Poseidon pool has real verifiers wired and holds funds, so the criticals
below are live-relevant on testnet and would be catastrophic on any real-value deploy.

---

## Findings summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| C1 | **Critical** | Note value not bound at shield → withdraw more than deposited | Fixed (needs deploy) |
| C2 | **Critical** | Missing amount range checks → field-overflow value inflation | Fixed (needs deploy) |
| C3 | **Critical** | Sealed-swap rate is caller-controlled → mint inflated output note | Fixed (needs deploy) |
| I1 | Info/Low | `transfer.circom` does not compile as committed (missing `IsZero`) | Fixed |
| L1 | Low | Duplicate-commitment footgun (unspendable note) | Fixed |
| L2 | Low | Dead root-history ring buffer / roots valid forever | Documented |
| I2 | Info | Empty-tree root pre-seeded as known | Accepted |
| I3 | Info | keccak note stack must never be wired to a Groth16 verifier | Boundary noted |

Verifier layer (all Groth16 verifiers + adapters) reviewed and found **clean**: every
public input is range-checked `< r`, input counts match (`unshield`=5, `transfer`=4,
`sealedSwap`=9), `DualProofVerifier` routes by length, `RejectVerifier` is unconditionally
false, and the `Scaffold*` verifiers carry "never set on a funded pool" banners.

---

## C1 — Critical: note value is not bound at shield time

**Root cause.** `ShieldPoolPoseidon.shield(asset, amount, commitment)` inserts a raw,
client-supplied `commitment` as a Merkle leaf and only checks that the funds actually
transferred equal `amount`. Nothing ties the commitment to `amount`. The value is
"checked" only later at unshield, against a **user-chosen public `amount`** that the
circuit hashes into `Poseidon(secret, amount, asset)` and proves is in the tree.

```solidity
// shield(): commitment is a black box, never checked against amount
deposited[asset] += amount;
tree.insert(uint256(commitment));   // <- no proof that commitment encodes `amount`
```

**Attack.** Deposit 1 wei with `commitment = Poseidon(secret, 10 ether, asset)`. The pool
now holds real user funds from other deposits. Unshield 10 ether: the proof is valid
(the leaf genuinely opens to 10 ether, membership holds), the pool only checks the
aggregate `deposited[asset] >= amount`, and pays out 10 ether. Net: 10 ETH for 1 wei.

**Impact.** Unauthenticated, repeatable, one transaction. Drains the entire pool balance
per asset. Confirmed against the app code (`ShieldView.tsx` sends `amount` and `commitment`
as independent args; a modified client decouples them).

**PoC.** `test/GloamSecurityFixes.t.sol::test_C1_value_not_bound_at_shield_drains_pool`
(attacker turns 1 wei into the victim's 10 ETH). The `MockVerifier` faithfully models "a
valid proof exists," because shield lets the attacker insert exactly the leaf the real
circuit would accept.

**Fix (shipped in source).** A shield (deposit) proof that binds the commitment to the
public `(amount, asset)`:
- `circuits/shield/shield.circom` — public `[commitment, amount, asset]`, private `secret`;
  constrains `commitment === Poseidon(secret, amount, asset)`, range-checks `amount`, and
  requires `secret != 0`. Note scheme is unchanged, so unshield/transfer stay compatible.
- `ShieldPoolPoseidon`: new `shieldVerifier` + `shieldBound(asset, amount, commitment, proof)`
  that verifies `[commitment, amount, asset]` before depositing. Once `setShieldVerifier` is
  called, plain `shield()` reverts `ShieldProofRequired`, forcing the bound path.

Witness-level proof the fix binds value:
```
honest deposit  (commit encodes 1, sends 1)     -> witness accepted
lying  deposit  (commit encodes 1e18, sends 1)  -> REJECTED at commitment=== constraint
```
Contract tests: `test_C1fix_plain_shield_blocked_when_verifier_set`,
`test_C1fix_shieldBound_rejects_bad_proof`, `test_C1fix_shieldBound_accepts_good_proof`.

---

## C2 — Critical: missing amount range checks → field-overflow value inflation

**Root cause.** `transfer.circom` and `sealedSwap.circom` enforce value conservation
(`amountIn === amountPay + amountChange`) in the BN254 scalar field **without range
checks on the amounts**. The sum can wrap mod `r`.

**Attack.** Own one real note of `amountIn = 1000`. Choose:
```
amountPay    = 1e18                     (the inflated payment note)
amountChange = (r - 1e18 + 1000) mod r  (a huge, discarded field element)
```
Then `amountPay + amountChange ≡ amountIn (mod r)`, the witness is valid, and the payment
note opens (via unshield) to 1e18. Independent of C1 (works even with a value-bound shield).

**PoC (against the real circuit).** `circuits/poc/gen_transfer_overflow.mjs` builds a valid
spent-note Merkle path, then honest vs inflated inputs. Witness generation on the real
`transfer` circuit:
```
honest   (1000 = 600 + 400)          -> witness generated (accepted)
inflated (1000-wei note -> 1e18)     -> witness generated (accepted)  == C2 PROVEN
```
The deployed Groth16 verifier accepts any proof of a satisfying witness, and all public
inputs (root, nullifier, commitments) are `< r`, so the pairing check passes.

**Fix (shipped in source).** 128-bit `Num2Bits` range checks on every amount in
`transfer.circom`, `sealedSwap.circom`, and `unshield.circom` (128 bits ≫ any real amount,
≪ `r ≈ 2^253`, so a two-output sum can never wrap). Re-run on the range-checked circuit:
```
honest   -> accepted
inflated -> REJECTED (Num2Bits assert)
```

---

## C3 — Critical: sealed-swap rate is caller-controlled

**Root cause.** `sealedSwap` takes `rateIn`/`rateOut` as **caller-supplied public inputs**.
The circuit only proves `amountOut * rateOut === amountSwap * rateIn` — it never constrains
the rate to a real price. The contract accepted whatever rate was passed
(`if (rateIn == 0 || rateOut == 0) revert` was the only check).

**Attack.** Spend a small `assetIn` note, declare `rateIn` huge / `rateOut` tiny, and mint
an `assetOut` note worth far more than the `assetIn` given up. Unshield it against the
pool's `assetOut` inventory. Drains inventory at an attacker-chosen price. The sealed-swap
verifier is live on the production pool.

**Fix (shipped, Solidity-only, no circuit change).** Owner-approved rate registry:
`swapRate[assetIn][assetOut] = {rateIn, rateOut, enabled}` set via `setSwapRate` (owner).
`sealedSwap` now requires the passed `(rateIn, rateOut)` to equal the approved rate for
that direction, else `RateNotAllowed`. Later replaceable by an oracle.
Tests: `test_C3_sealedSwap_reverts_when_no_rate_set`, `test_C3_sealedSwap_reverts_on_wrong_rate`,
`test_C3_sealedSwap_succeeds_on_approved_rate`, `test_C3_setSwapRate_only_owner`.

---

## Lower-severity

- **I1 (Fixed).** `transfer.circom` used `IsZero()` but neither defined nor included it, so
  it did not compile as committed — a sign the committed source drifted from whatever
  produced the deployed `TransferVerifier`. Fixed by including `comparators.circom`.
  Action item: re-derive and re-verify the deployed transfer verifier against this source.
- **L1 (Fixed).** No duplicate-leaf guard: two identical commitments share a nullifier, so
  the second becomes permanently unspendable. Added `commitmentSeen` guard on every insert
  path (`shield`/`shieldBound`/`transfer`/`sealedSwap`) in both pools.
- **L2 (Documented).** `isKnownRoot` reads only the permanent `knownRoots` map; the
  `rootHistory` ring buffer is written but never read, and all historical roots are valid
  forever. This is safe (arguably preferable — proofs never expire); comment corrected to
  say so.
- **I2 (Accepted).** Empty-tree root is pre-seeded as known; harmless (no membership proof
  exists against an empty tree, and `isKnownRoot(0)` is rejected).
- **I3 (Boundary).** keccak `NoteLib`/`IncrementalMerkleTree`/`ShieldPool` produce 256-bit
  values, ~81% of which are `>= r`; never wire that stack to a Groth16 verifier.

---

## Deployment / migration plan (NOT done — requires the owner)

The C1 and C2 fixes change the circuits, so shipping them is a coordinated migration, not a
hot patch. In order:

1. Compile the hardened circuits (`unshield`, `transfer`, `sealedSwap`, new `shield`).
2. Run a fresh Groth16 trusted setup (ptau + zkey) and generate the four verifier contracts.
3. Deploy a fresh `ShieldPoolPoseidon` (its storage layout changed: new mappings + verifier),
   set `verifier`, `sealedSwapVerifier`, and `shieldVerifier`, and `setSwapRate` for each
   live pair.
4. Update the app: generate a shield proof and call `shieldBound`; regenerate proving
   artifacts for the range-checked circuits (proof shape is unchanged).
5. Point `NEXT_PUBLIC_POSEIDON_SHIELD_POOL` at the new pool + deploy block. Migrate/retire
   the old pool's small testnet balance via `emergencyWithdraw`.

The C3 rate registry and the L1 duplicate guard are pure Solidity and ride along with the
same redeploy (no separate trusted setup needed).

**Do not enable the production pool for real value until steps 1–4 are complete and the new
verifiers are confirmed to match the hardened circuits.**
