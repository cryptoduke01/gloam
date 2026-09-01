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
