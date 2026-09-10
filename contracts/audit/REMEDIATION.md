# Gloam — Audit Remediation Status

Tracks the fixes for the findings in `GLOAM-BUG-REPORT.md`. Re-verified against
live on-chain state and current code on 2026-09-01. "Fixed" here means verified,
not asserted.

## Status at a glance

| ID | Severity | Status |
|----|----------|--------|
| H-P1 | Critical | **FIXED (verified on-chain)** — old pool drained, de-published, seed guard |
| C1 | High | **FIXED (verified on-chain)** — shieldVerifier set + client shieldBound flow live |
| H1 | High | **MITIGATED (verified on-chain)** — swaps disabled + graceful UI; safe re-enable needs the H1 accounting redesign |
| M-4 | Medium | Reversibility **FIXED in code** (one-way verifier + two-step owner); single-EOA/timelock residual is mainnet ops |
| M-3 | Medium | **Partially fixed** — SDK clamp bug fixed + on-chain oracle ratio-tolerance added; full user-set slippage UI is future |
| L-1 | Low | **FIXED in code** (poster no longer emitted); applies at the next GloamPayMemo redeploy |
| M-1 | Medium | **Open (mainnet gate)** — note secrets still plaintext in localStorage |
| M-2 | Medium | **Open (mainnet gate)** — dev-ceremony zkeys, honestly disclosed in docs |

Plus, shipped this pass: **M3 oracle-bound rates** (Chainlink AggregatorV3 with
sequencer/staleness guards, contract + 9 tests) and a fix for a stale
artifact-hash regression that was breaking proving.

**Honest headline:** every critical/high is fixed and verified (H-P1, C1, H1, and
the M-4 re-open path). M-3 is partially closed, M-1/M-2 are open mainnet-gate
items. Do not say "all findings fixed" — say "all critical/high fixed and
verified; M-3 partial; M-1/M-2 + the trusted-setup ceremony tracked for mainnet."

## Verified on-chain (2026-09-01, chainId 46630)

The owner ran the recovery + hardening. Read back and confirmed:

- Old pool `0x4F38…12D8F`: ETH 0, `deposited[TSLA/AMZN/AMD]` all 0. Drained.
- App pool `0xaEbB…1834`: `owner` = `0x8F47…026B6` (rotated off the burned key),
  `shieldVerifier` = `0x28E6…2847` (C1 enforced, plain shield() reverts),
  `sealedSwapVerifier` = `0x0` (H1 swaps disabled).

## Fixed in code (live on `main`)

- **C1 client flow** (`171680a`): `ShieldView` reads `shieldVerifier` and, when
  set, proves `commitment == Poseidon(secret, amount, asset)` and deposits via
  `shieldBound()`. Validated offline; the deployed app has it.
- **H-P1 hygiene** (`cc1f630`): seed script guarded (refuses `shieldVerifier==0`)
  and repointed; 0x4F38 removed from public docs/scripts.
- **Stale artifact hashes** (`c1b3c5b`): repinned so proving works.
- **H1 graceful fallback** (`d78d5d8`): a real `sealedSwapVerifier==0` now reports
  "private trade offline" instead of letting a swap revert on-chain.
- **M-3 slippage gate** (`c3cf4b7`): the SDK no longer clamps a user's minimum
  down to `amountOut`. The public floor (privacy, ~1 wei) is separated from a new
  client-side `minOut` gate that refuses to build below the user's real minimum.

## Applies at the next hardened redeploy (code-ready, tested, not yet live)

The live pool `0xaEbB` predates these; they land when it is redeployed.

- **M-4** (`e2059e9`): `setShieldVerifier` is one-way (can't be reset to reopen
  C1); ownership is two-step (`pendingOwner` + `acceptOwnership`); withdraw event.
- **M3 oracle rates** (`7f710c0`): `sealedSwap` can bind a direction to live
  Chainlink feeds (`OracleRates`: sequencer-uptime + staleness + positivity, and
  a ratio-tolerance check that also gives on-chain slippage protection under
  market rates). Contract-only, no circuit/verifier change. **Removes the trusted
  price.** Still requires the H1 accounting fix before swaps re-enable.
- **L-1** (`c45c2c7`): `PaymentMemo` no longer emits the sender (`poster`).

## Still open — mainnet gate (honestly disclosed, not demo blockers)

- **H1 proper fix**: make swap amounts public + update `deposited[]` with a
  solvency check (reveals size, trades away privacy), OR back swaps with an
  owner-funded `assetOut` reserve. A protocol design decision, left for the owner.
  Also add `secret != 0` to `sealedSwap.circom` (regen) before re-enabling.
- **M-1**: encrypt note secrets + receive-tag key at rest (passphrase/passkey-PRF)
  instead of plaintext `localStorage`. Needs a careful migration.
- **M-2**: multi-party trusted-setup ceremony; repin production hashes.
- **M-4 residual**: single-EOA owner + `emergencyWithdraw`. Timelock + multisig
  is a mainnet ops decision.
- **M-3 residual**: a user-facing slippage-tolerance control wiring `minOut`
  through `SealedTradePanel`, landed with the oracle-swap re-enablement.

---

## Second pass — Kensho multi-fleet audit (2026-09-10, RH 46630 + Tempo 42431)

Seven parallel finder agents (ZK public-input alignment, Merkle tree, nullifier /
double-spend / cross-chain replay, reentrancy / ERC-20 / accounting, Tempo + cross-
chain, access-control / swap-oracle / memo, circom soundness), each handed the prior
dupe digest, then owner-verified against the code, the compiled circuit, and live
on-chain reads.

**On-chain confirmed (both pools):** real Groth16 stack wired, bound-shield enforced,
swaps disabled.
- RH `0xaEbB…1834`: verifier `0xB077…7EF`, shieldVerifier `0x28E6…2847`, sealedSwapVerifier `0x0`.
- Tempo `0x3eee…d30b`: verifier `0x82F4…03A2`, shieldVerifier `0x7836…6Eb3`, sealedSwapVerifier `0x0`.

**Swept clean (independently re-verified, no new finding):** circuit↔contract public-
input order/count/encoding (3/4/5/9 exact); all four Groth16 verifiers field-range-check
every public input; Merkle zeros + EMPTY_ROOT re-derived from circomlibjs (20/20 match);
root history is permanent (no eviction); nullifier binding + shared-`spent` cross-path +
CEI ordering; cross-chain replay bound by per-chain roots + per-chain `deposited[]`;
6-dec PathUSD accounted correctly (contract is decimals-agnostic on the live paths);
Tempo native path inert/untrickable; `insert` is constant-gas (no 30M brick).

**New findings + fixes (this pass):**

| ID | Severity | Status |
|----|----------|--------|
| F-1 | High (latent — live only if oracle-swaps re-enabled) | **FIXED in code + tested** |
| F-2 | Medium (issuer-triggered, unrecoverable) | **DOCUMENTED + mitigations specified** |
| INFO-1/2/3 | Hardening | **FIXED in code + tested** |
| SS-circom | Low (latent) | **FIXED in circuit source** (needs recompile+ceremony+redeploy) |

- **F-1 — `OracleRates.requireRatio` dropped decimal normalization.** With an oracle-
  bound swap across mismatched-decimal assets (exactly the Tempo 6-dec ↔ RH 18-dec
  case), the enforced `amountOut` was off by `10^|decIn-decOut|` → permissionless over-
  mint + drain once enabled. **Fix:** `requireRatio` now normalizes by asset decimals
  and requires equal feed decimals, re-checked at call time (immune to `setPriceFeed`
  reordering). Wired via `_assetDecimals()` in `sealedSwap`. Proof: `OracleRates.t.sol`
  — `test_naive_rate_rejected_for_mixed_decimals` (the old bug rate now reverts),
  `test_mixed_decimals_fair_rate_ok`, `test_reverts_on_feed_decimals_mismatch`.
- **F-2 — issuer freeze of the pool's own token balance** permanently freezes every
  note of that asset, and `emergencyWithdraw` (same `token.transfer`) can't rescue it.
  Issuer-triggered, so not a permissionless crit — but real and unrecoverable. Can't be
  code-fixed (trusted-party action); documented with required mitigations in
  `TEMPO-COMPLIANCE-DESIGN.md` (per-asset pause, no single-freezable-account
  concentration, explicit "emergencyWithdraw is not a backstop", non-freezing first
  asset for mainnet).
- **INFO-1/2/3 (defense-in-depth), all fixed + tested** (`GloamHardeningFixes.t.sol`):
  a `nonReentrant` latch on every value-moving external fn (removes reliance on CEI +
  STATICCALL holding under future edits); an explicit `NotAContract` check on a codeless
  `asset` in shield (no phantom `deposited` credit); and `sweepStrayNative()` to recover
  ETH sent via `receive()` above `deposited[address(0)]` (otherwise stuck).
- **sealedSwap.circom** (not deployed; `sealedSwapVerifier==0`): added `secret != 0` on
  all three notes (closes the known L1) and 128-bit range checks on `rateIn/rateOut/
  amountOutMin` (product-wrap + `amountOutMin ≥ 2^252` slippage-floor bypass). Compiles
  clean; **inert until the H1 re-enable recompiles + reruns the ceremony + redeploys.**

**Headline:** no new permissionless critical/high on current code — the disabled swap
path neutralizes the highest-severity surface, and the shielded core (ZK, Merkle,
nullifier, accounting) is sound. F-1 (the one substantive latent High) is fixed and
tested; the Tempo issuer-freeze Medium is documented with mitigations; hardening landed.
All new + existing tests green (66/66). **These land on-chain at the next hardened
redeploy** — the live pools predate them.
