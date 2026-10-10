# Gloam: Audit Remediation Status

Tracks the fixes for the findings in `GLOAM-BUG-REPORT.md` and the second pass
below. Both audits are internal (self-run Kensho passes, then owner-verified);
there has been no external audit yet. "Fixed" here means verified, not asserted.

Last re-verified against live on-chain state and current code on **2026-10-10**.
Earlier sections are kept as a log; pool addresses in them are marked where they
have since been superseded.

## Status at a glance (2026-10-10)

| ID | Severity | Status |
|----|----------|--------|
| H-P1 | Critical | **FIXED (verified on-chain)**: old pool drained, de-published, seed guard |
| C1 | High | **FIXED (verified on-chain)**: `shieldVerifier` set on both current pools; plain `shield()` reverts, deposits go through `shieldBound()` |
| H1 | High | **MITIGATED (verified on-chain)**: `sealedSwapVerifier` is `0x0` on both current pools, so swaps are off; safe re-enable needs the H1 accounting redesign and an audit |
| M-4 | Medium | **FIXED and live** since the 2026-09-29 redeploy: one-way shield verifier, two-step owner, `emergencyWithdraw` removed, every rule change behind a 3-day public timelock. Residual: the owner is a single wallet |
| M-3 | Medium | **Partially fixed**: SDK clamp bug fixed + on-chain oracle ratio-tolerance added; full user-set slippage UI is future |
| L-1 | Low | **FIXED on Tempo, relay-only on Robinhood Chain**: the Tempo memo board is deployed from the fixed source (no poster). The Robinhood Chain board `0x689e…5DCE` is the first deploy and still indexes the poster, so the sender stays off it only when the Gloam relay posts the memo |
| M-1 | Medium | **Partly fixed**: note secrets (and payroll runs and schedules) are encrypted at rest in `noteVault`, under a non-extractable AES-GCM device key or a passkey PRF wrap. The receive key's at-rest encryption is being fixed in a separate change |
| M-2 | Medium | **Open (mainnet gate)**: single-contributor dev-ceremony zkeys, disclosed in docs |

**Honest headline:** every critical/high is fixed and verified (H-P1, C1), or
switched off and verified (H1). M-4 is fixed on-chain apart from the single-wallet
owner. M-3 and M-1 are partly closed, M-2 is an open mainnet-gate item. Do not say
"all findings fixed"; say "all critical/high fixed or switched off and verified;
M-1 and M-3 partial; M-2 and the multi-party ceremony tracked for mainnet."

## Current pools (verified on-chain 2026-10-10)

Redeployed 2026-09-29 with no admin withdraw. Read back on both:

- Robinhood Chain `46630`, pool `0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740`:
  `verifier` = `0xB077…f7eF`, `shieldVerifier` = `0x28E6…2847`,
  `sealedSwapVerifier` = `0x0`, `setupMode` = `false`, `CHANGE_DELAY` = 3 days.
  Memo board `0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE` (indexes the poster).
- Tempo `42431`, pool `0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb`:
  `verifier` = `0x82F4…03A2`, `shieldVerifier` = `0x7836…6Eb3`,
  `sealedSwapVerifier` = `0x0`, `setupMode` = `false`, `CHANGE_DELAY` = 3 days.
  Memo board `0x3ca88712e9219b5EE4c82D31cAfEaB64C9E9b4E3` (no poster).
- Owner on both: `0x7dB5…35a9`, a single wallet (no contract code).

The owner cannot withdraw pooled funds. It can still change the dual verifier,
the sealed-swap verifier, rates and oracle config, but only by queueing the
change on-chain and waiting the public 3-day delay. The shield verifier is
one-way and cannot be changed once set.

Superseded pools (history only): Robinhood Chain `0xAc25…aF1c` (2026-09-16) and
`0xaEbB…1834` (2026-09-01); Tempo `0xeD0b…2276` (2026-09-16) and `0x3eee…d30b`.

Contract tests: 93/93 green (`forge test`, 2026-10-10).

---

## First pass: verified on-chain (2026-09-01, chainId 46630)

The owner ran the recovery + hardening. Read back and confirmed:

- Old pool `0x4F38…12D8F`: ETH 0, `deposited[TSLA/AMZN/AMD]` all 0. Drained.
- App pool `0xaEbB…1834` (superseded 2026-09-16): `owner` = `0x8F47…026B6`
  (rotated off the burned key), `shieldVerifier` = `0x28E6…2847` (C1 enforced,
  plain shield() reverts), `sealedSwapVerifier` = `0x0` (H1 swaps disabled).

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
- **M-1 notes at rest**: `app/src/lib/noteVault.ts` keeps notes in memory and
  persists them AES-GCM encrypted, under a non-extractable device key in
  IndexedDB or a data key wrapped by a passkey PRF (`passkeyWrap.ts`). Payroll
  runs and schedules are sealed under the same key.

## Landed at the hardened redeploys (2026-09-16, carried into 2026-09-29)

At the time of the first pass these were code-ready but not live, because pool
`0xaEbB` predated them. They are now on-chain in the current pools.

- **M-4** (`e2059e9`): `setShieldVerifier` is one-way (can't be reset to reopen
  C1); ownership is two-step (`pendingOwner` + `acceptOwnership`). The
  2026-09-29 redeploy (`09d454d`) also removed `emergencyWithdraw` and put every
  rule change behind `ChangeTimelock` (3-day delay).
- **M3 oracle rates** (`7f710c0`): `sealedSwap` can bind a direction to live
  Chainlink feeds (`OracleRates`: sequencer-uptime + staleness + positivity, and
  a ratio-tolerance check that also gives on-chain slippage protection under
  market rates). Contract-only, no circuit/verifier change. **Removes the trusted
  price.** Inert while swaps are off; still requires the H1 accounting fix before
  swaps re-enable.
- **L-1** (`c45c2c7`): `PaymentMemo` no longer emits the sender (`poster`). Live
  on the Tempo memo board; the Robinhood Chain board has not been redeployed.

## Still open: mainnet gate (honestly disclosed, not demo blockers)

- **H1 proper fix**: make swap amounts public + update `deposited[]` with a
  solvency check (reveals size, trades away privacy), OR back swaps with an
  owner-funded `assetOut` reserve. A protocol design decision, left for the owner.
  `secret != 0` is now in `sealedSwap.circom` source; it needs a recompile and
  ceremony before re-enabling.
- **M-1 remainder**: encrypt the receive key at rest (in progress, separate
  change).
- **M-2**: multi-party trusted-setup ceremony; repin production hashes.
- **M-4 residual**: single-wallet owner. The timelock is live; moving the owner
  to a multisig is a mainnet ops decision.
- **M-3 residual**: a user-facing slippage-tolerance control wiring `minOut`
  through `SealedTradePanel`, landed with the oracle-swap re-enablement.
- **L-1 on Robinhood Chain**: redeploy the memo board from the fixed source, or
  keep relaying memos there.

---

## Second pass: Kensho multi-fleet audit (2026-09-10, RH 46630 + Tempo 42431)

Internal. Seven parallel finder agents (ZK public-input alignment, Merkle tree,
nullifier / double-spend / cross-chain replay, reentrancy / ERC-20 / accounting,
Tempo + cross-chain, access-control / swap-oracle / memo, circom soundness), each
handed the prior dupe digest, then owner-verified against the code, the compiled
circuit, and live on-chain reads.

**On-chain confirmed (both pools at the time, both since superseded):** real
Groth16 stack wired, bound-shield enforced, swaps disabled.
- RH `0xaEbB…1834` (superseded): verifier `0xB077…7EF`, shieldVerifier `0x28E6…2847`, sealedSwapVerifier `0x0`.
- Tempo `0x3eee…d30b` (superseded): verifier `0x82F4…03A2`, shieldVerifier `0x7836…6Eb3`, sealedSwapVerifier `0x0`.

The current pools reuse the same verifiers; see "Current pools" above.

**Swept clean (re-verified, no new finding):** circuit↔contract public-input
order/count/encoding (3/4/5/9 exact); all four Groth16 verifiers field-range-check
every public input; Merkle zeros + EMPTY_ROOT re-derived from circomlibjs (20/20 match);
root history is permanent (no eviction); nullifier binding + shared-`spent` cross-path +
CEI ordering; cross-chain replay bound by per-chain roots + per-chain `deposited[]`;
6-dec PathUSD accounted correctly (contract is decimals-agnostic on the live paths);
Tempo native path inert/untrickable; `insert` is constant-gas (no 30M brick).

**New findings + fixes (this pass):**

| ID | Severity | Status |
|----|----------|--------|
| F-1 | High (latent, live only if oracle-swaps re-enabled) | **FIXED in code + tested**, on-chain since 2026-09-16 |
| F-2 | Medium (issuer-triggered, unrecoverable) | **DOCUMENTED + mitigations specified** |
| INFO-1/2/3 | Hardening | **FIXED in code + tested**, on-chain since 2026-09-16 |
| SS-circom | Low (latent) | **FIXED in circuit source** (needs recompile+ceremony+redeploy) |

- **F-1: `OracleRates.requireRatio` dropped decimal normalization.** With an oracle-
  bound swap across mismatched-decimal assets (exactly the Tempo 6-dec ↔ RH 18-dec
  case), the enforced `amountOut` was off by `10^|decIn-decOut|`, a permissionless
  over-mint + drain once enabled. **Fix:** `requireRatio` now normalizes by asset
  decimals and requires equal feed decimals, re-checked at call time (immune to
  `setPriceFeed` reordering). Wired via `_assetDecimals()` in `sealedSwap`. Proof:
  `OracleRates.t.sol`: `test_naive_rate_rejected_for_mixed_decimals` (the old bug
  rate now reverts), `test_mixed_decimals_fair_rate_ok`,
  `test_reverts_on_feed_decimals_mismatch`.
- **F-2: issuer freeze of the pool's own token balance** permanently freezes every
  note of that asset. At the time `emergencyWithdraw` (same `token.transfer`)
  could not rescue it either; it has since been removed. Issuer-triggered, so not
  a permissionless crit, but real and unrecoverable. Can't be code-fixed
  (trusted-party action); documented with required mitigations in
  `TEMPO-COMPLIANCE-DESIGN.md` (per-asset pause, no single-freezable-account
  concentration, non-freezing first asset for mainnet).
- **INFO-1/2/3 (defense-in-depth), all fixed + tested** (`GloamHardeningFixes.t.sol`):
  a `nonReentrant` latch on every value-moving external fn (removes reliance on CEI +
  STATICCALL holding under future edits); an explicit `NotAContract` check on a codeless
  `asset` in shield (no phantom `deposited` credit); and `sweepStrayNative()` to recover
  ETH sent via `receive()` above `deposited[address(0)]` (otherwise stuck).
- **sealedSwap.circom** (not deployed; `sealedSwapVerifier==0`): added `secret != 0` on
  all three notes (closes the known L1) and 128-bit range checks on `rateIn/rateOut/
  amountOutMin` (product-wrap + `amountOutMin ≥ 2^252` slippage-floor bypass). Compiles
  clean; **inert until the H1 re-enable recompiles + reruns the ceremony + redeploys.**

**Headline (2026-09-10):** no new permissionless critical/high on current code. The
disabled swap path neutralizes the highest-severity surface, and the shielded core
(ZK, Merkle, nullifier, accounting) is sound. F-1 (the one substantive latent High)
is fixed and tested; the Tempo issuer-freeze Medium is documented with mitigations;
hardening landed. All tests green at the time (66/66). These landed on-chain at the
2026-09-16 redeploy and carry into the current 2026-09-29 pools (93/93 tests after
the no-admin-withdraw change).
