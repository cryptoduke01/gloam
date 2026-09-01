# Gloam — Audit Remediation Status

Tracks the fixes for the findings in `GLOAM-BUG-REPORT.md`. Split into three
buckets: fixed in code (shipped to `main`), needs the owner key (on-chain calls
only you can make), and mainnet gate (documented, applied at the production
redeploy). Nothing here required moving funds or deploying; the on-chain actions
below are yours to run.

## Status at a glance

| ID | Severity | Status | Who acts |
|----|----------|--------|----------|
| H-P1 | Critical | Code hygiene shipped; **funds recovery pending** | Owner key |
| H1 | High | Mitigation is to disable swaps; proper fix is a design decision | Owner key (+ later redesign) |
| C1 | High | **Client shieldBound flow shipped**; enforcement pending | Owner key |
| M-1 | Medium | Documented (mainnet gate) | Later |
| M-2 | Medium | Documented (mainnet gate) | Later |
| M-3 | Medium | Client guard shipped + documented | Done / mainnet gate |
| M-4 | Medium | Contract hardening in code (mainnet gate) | Redeploy |
| L-1 | Low | Documented + client-side note | Redeploy / later |
| L-2 | Low/info | Documented | Later |

Also fixed in passing: a **stale-artifact-hash regression** (`c1b3c5b`) that would
have thrown "hash mismatch, refuse to prove" on every unshield/transfer/swap after
the hardened-pool flip. Repinned all six fingerprints + added shield.

---

## Owner-key actions (run these; they need your funded key)

Set your shell first:

```bash
export RPC_URL=https://rpc.testnet.chain.robinhood.com
export DEPLOYER_PK=0xYOUR_FUNDED_TESTNET_KEY   # owner 0xE1B0…e828
```

### 1. Recover the drainable pool 0x4F38 (H-P1) — do this first

The old pool holds 0.005 ETH + 1e18 each of TSLA/AMZN/AMD and is drainable by
anyone. Pull everything back to yourself:

```bash
OLD=0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F
ME=0xE1B0ddF821F1faA9402b0B8C4E66B213f877e828
cast send $OLD "emergencyWithdraw(address,address,uint256)" 0x0000000000000000000000000000000000000000 $ME 5000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
cast send $OLD "emergencyWithdraw(address,address,uint256)" 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E $ME 1000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
cast send $OLD "emergencyWithdraw(address,address,uint256)" 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02 $ME 1000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
cast send $OLD "emergencyWithdraw(address,address,uint256)" 0x71178BAc73cBeb415514eB542a8995b82669778d $ME 1000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
```

The seed script now refuses to reseed any unhardened pool, and 0x4F38 is out of
the public docs.

### 2. Enforce bound shields on the app pool (C1)

The app now proves the commitment and calls `shieldBound()` automatically **once
the pool has a shield verifier**. Turn it on:

```bash
NEW=0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834
cast send $NEW "setShieldVerifier(address)" 0x28E6d0D02568EE634f9596645775275DE76b2847 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
```

After this, plain `shield()` reverts `ShieldProofRequired` and the app switches to
the proving path on its own. Test a shield in the app afterward. Do not seed or
deposit into the pool before this call.

### 3. Disable sealed swaps until they are redesigned (H1)

`sealedSwap()` does not update per-asset solvency accounting, so with real
`assetOut` inventory it lets a swapper drain honest holders. Until the accounting
is redesigned (below), disable it:

```bash
cast send $NEW "setSealedSwapVerifier(address)" 0x0000000000000000000000000000000000000000 --rpc-url $RPC_URL --private-key $DEPLOYER_PK
```

This turns off private trade. Keep it off on any pool that holds real inventory.

---

## Fixed in code (shipped to main)

- **H-P1 hygiene** (`cc1f630`): `SeedVaultInventory` repointed off 0x4F38 to the
  hardened pool and now `require`s `shieldVerifier != 0` before seeding; 0x4F38
  removed from the public chain docs, smoke script, and architecture notes.
- **C1 client flow** (`171680a`): `ShieldView` reads `shieldVerifier` and, when
  set, proves `commitment == Poseidon(secret, amount, asset)` in the browser and
  deposits via `shieldBound()`. Legacy pools keep plain `shield()`, so it is safe
  to ship before you flip the verifier.
- **Stale artifact hashes** (`c1b3c5b`): repinned all circuit fingerprints so
  proving works after the artifact swap.
- **M-3** guard + docs: the size-privacy floor (`amountOutMin = 1 wei`) is
  intentional and safe under the current owner-pinned fixed rate. When rates
  become market-driven, the client must refuse when the computed output is below
  the user's real minimum. Tracked for the oracle-rate work.

---

## Needs a production redeploy (mainnet gate; code prepared)

- **M-4 centralization**: two-step ownership, a set-once (one-way) shield
  verifier so it can never be reset to 0 to reopen C1, and an event on
  `emergencyWithdraw`. Implemented in the contract for the next deploy; the live
  testnet pool is unaffected until then. Full mainnet posture also wants a
  timelock + multisig owner, which is an ops decision.
- **H1 proper fix**: either make the swap amounts public and update
  `deposited[assetIn] -= amountSwap; deposited[assetOut] += amountOut` with a
  solvency check (this reveals swap size, so it trades away size privacy), or
  back swaps with an explicit owner-funded `assetOut` reserve and account against
  it. This is a protocol design call, so it is left for you rather than chosen
  autonomously. The circuit also needs `secret != 0` added to
  `sealedSwap.circom` (regen + redeploy) before swaps are re-enabled.
- **M-1**: encrypt note secrets + the receive-tag key at rest (passphrase or
  passkey-PRF derived) instead of plaintext `localStorage`. Requires a careful
  migration so existing notes are not lost; left for a reviewed change.
- **M-2**: run a multi-party trusted-setup ceremony and repin production hashes.
- **L-1**: de-index the `poster` in `GloamPayMemo` (or post via a relayer) and
  have wallets authenticate the memo before surfacing an incoming payment.

---

## Verified sound (no change needed)

Per the report: the three catastrophic circuit bugs are genuinely fixed
(commitment binding, `Num2Bits(128)` range checks, on-chain pinned swap rate),
nullifier derivation is consistent across paths, all wired verifiers are real
Groth16, and the client uses CSPRNG secrets with the recipient bound as a public
signal. The hardened pool `0xaEbB…1834` is the one to use; the keccak pool
`0x2BD9…` is empty with no exit path.
