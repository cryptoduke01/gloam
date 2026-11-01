# Deploy the next swap router

The runbook for private swaps v3: `GloamVaultSwapV4c` on Robinhood Chain, Base and
Ethereum, and `GloamVaultSwapTempo2` on Tempo. The owner wallet deploys from a local
page in the browser. No agent, no CI and no script holds a key or sends anything.

**Don't deploy before an outside review.** This router moves user money and has not
had one. See [What to review first](#what-to-review-first).

## What this adds

- **Native ETH notes.** A swap can spend a native ETH note or make one, on Robinhood
  Chain, Base and Ethereum. WETH notes keep working. Either note can use a pool that
  holds ETH or one that holds WETH: the router converts at the ends of a route.
- **Base and Ethereum.** Uniswap v4, hookless pools only.
- **An exit.** Money waiting at a swap's escrow can leave to an address the swap's
  one-time exit key signs for, when its refund can't land.
- **A deadline.** Each swap carries one in its escrow key, 30 minutes after it is made
  by default (`SWAP_DEADLINE_SECONDS`). It can't land after that. A refund and an exit
  have no deadline.

## What it can't change

The deployed vault stays as it is. The routers before this one stay as they are too,
and a refund through them works the way it always has: it waits for room under the
vault's limit, with no exit. Only swaps made through the new router have one.

## The exit, and what it costs

A refund note is a deposit, so it needs room under the vault's limit for that asset.
The vault can't exempt it. While the limit is full, the money waits at the escrow.

Each swap names a throwaway exit key in its escrow key. The key comes from the refund
note's own secret, so whoever can spend the refund note can exit, and nobody else. The
escrow key fixes the exit key, so a caller who names another one gets another escrow,
and the vault rejects the proof. Nothing in a swap's proofs or calldata can sign for it.

The holder signs for an address. Anyone can send that signature, the relay included,
and it can only pay the address it names. The escrow opens once, so a refund and an
exit can never both happen.

**The trade-off: an exit is public.** It pays a public address the whole amount, next to
the swap. A refund stays private and costs up to 1%. An exit keeps everything that
arrived and gives up privacy for that one note. So the refund stays the normal way back.
The exit is for someone who would rather have the money now than wait for room.
A fresh address keeps the damage to that note, and the relay can pay the gas.

## Before you start

From `contracts/`, on the commit that was reviewed:

```sh
forge build
forge test
node launch/router-fixture.mjs   # rewrites nothing if the contracts are unchanged
git status                       # must show no change to test/fixtures/router-next.json
```

Dry run each chain. Nothing is sent, and no key is involved:

```sh
forge script script/DeployVaultSwapV4c.s.sol:DeployVaultSwapV4c --sig "dryRun()" --rpc-url https://rpc.mainnet.chain.robinhood.com
forge script script/DeployVaultSwapV4c.s.sol:DeployVaultSwapV4c --sig "dryRun()" --rpc-url https://mainnet.base.org
forge script script/DeployVaultSwapV4c.s.sol:DeployVaultSwapV4c --sig "dryRun()" --rpc-url https://ethereum-rpc.publicnode.com
```

Use a plain `forge build`. `--evm-version cancun`, which the fork tests need, builds
different bytecode, and the page refuses it.

**Any edit to the contracts moves the addresses,** a comment included, because the
bytecode carries a hash of its source. After one, run `router-fixture.mjs`, commit the
fixture, and update the addresses wherever they are pinned.

## Deploy

```sh
node launch/serve-router.mjs     # http://127.0.0.1:4732/router
```

Each chain has its own card, and they don't depend on each other. A card's Deploy stays
shut until the factory call has been simulated and lands at the pinned address, and
after it lands the card reads everything back: the code byte for byte, the vault, the
treasury, the PoolManager, WETH, the owner, every pool, and `escrowFor` against the
pinned escrow code.

| Chain | Router | Pools | Deploy gas |
| --- | --- | --- | --- |
| Robinhood Chain | `0xFD1547d9C404Bf670c9652d1D6007A1bB6528b93` | 45 | 4.6M |
| Base | `0x0742fFA3d1C8e74765F8186d5E2133c307e2557c` | 7 | 3.6M |
| Ethereum | `0xE36883A156ce5Ed68F083DdA79Bad7cf07AC5B2c` | 13 | 3.7M |
| Tempo | `0x75A22213c7d64438246348129b843d69b76f2535` | no pools, its DEX | see the card |

These hold for the contracts in `test/fixtures/router-next.json`, which
`test_v3_predicted_addresses_are_pinned` checks.

## Switch a chain on

Deploying changes nothing. A chain goes live with one line in the app, and each chain's
switch stands alone.

1. Wait for the chain's card to read `Deployed and checked`.
2. If this is the first chain, publish the SDK. Its `VAULT_SWAP_ROUTERS` already lists
   these addresses, and the app and relay build against it, but an agent on an older npm
   version isn't refused a cash out to a router until it updates.
3. In `app/src/lib/vaultSwap.ts`, set `VAULT_SWAP_V3_LIVE[<chainId>]` to `true`:
   `4663` Robinhood Chain, `8453` Base, `4217` Tempo. Leave `1` alone: see
   [Ethereum](#ethereum-what-a-swap-costs).
4. In the same PR, update `app/scripts/selftest-vault-swap.mts`, the one selftest that pins
   what ships: the `no chain is on` line and the router it expects first. The other 77
   follow the flags. Update the plain files listed below too.
5. Merge it. The swap tab, the docs, `/verify`, the vote exclusions and Glim all follow
   the flag. The cash-out guard needs no flag: it refuses these routers already.
6. Make one small real swap each way, one of them from an ETH note where the chain has
   one, and read both on the explorer.

This was rehearsed with Robinhood Chain, Base, Tempo and `VAULT_SWAP_V3_LIVE[1]` all on: the
build passed, the docs rendered every chain but Ethereum, and only that one selftest failed.

**Which docs follow the flag.** `/docs/private-swaps`, `/docs/threat-model`, `/docs/chain`,
`/verify` and Glim do, so they are true either side of a switch. `README.md`, `AGENTS.md`,
`mcp/README.md` and `packages/sdk/README.md` are plain files and can't: update their swap
lines in step 4.

**The switch only goes one way.** Once a chain has had a swap through the new router, do
not set its flag back to `false`. The relay would stop knowing that router, and a refund or
an exit of a swap made through it would be refused. To stop swaps on a v4 chain, the owner
calls `removePool` for its pools: swaps through them revert with the note safe, and
refunds and exits never touch a pool. `GloamVaultSwapTempo2` has no owner and no pools.

## There is no fixed order

Deploying changes nothing for anyone, because no app or relay uses a router until it is
switched on. Each chain's deploy and switch stand alone. What matters is what each
step needs:

| Step | Needs | If it runs early |
| --- | --- | --- |
| Deploy on a chain | Outside review | Nothing breaks. The router sits unused. |
| New pool after deploy | The owner queues it, live 3 days later | Pools queued on the old router do not carry over. The list is in the constructor. |
| ETH swaps on Robinhood Chain | The vault's native ETH limit, ready 3 November at 17:08 UTC, executed | A swap into ETH reverts whole with `OverDepositLimit`, and the note stays in the vault. |
| AI and ORBIO on the new router | Their vault limits executed | The pools are live from deploy, but a swap into either reverts whole until the vault takes it. |
| The 0.50% cash-out fee (3 November, 15:30 UTC) | Nothing here | The router reads no fee. A quote made before it and landing after can come up short and revert whole, and the note stays. A refund is safe: its 1% margin covers any fee the vault allows. |

## What happens to swaps in flight

A swap belongs to its router. Its escrow address comes from that router, and its
unshield proof names that escrow, so it can never land anywhere else.

- **Sent and landing:** finishes on the old router. Nothing about a switch touches it.
- **Reverted, proof still public:** it stays valid until the note is spent, as it does
  today. The app moves the note to a fresh one, which ends it.
- **Unshield sent alone:** the money waits at the old router's escrow. Only the old
  router can open it. The relay must keep every old router for this, for good: never
  remove one from the app's router list.

## Retiring the old router

1. Switch the chain on, as above. New quotes go to the new router, and the relay refuses
   a new swap on an older one with `swap_router_old`: a tab still holding an old quote gets
   a clear message and the note stays put. A refund through an older router still goes,
   because its note is already spent.
2. Wait at least an hour, the time the app gives a swap it never heard back from.
3. Optional, on Robinhood Chain: the owner calls `removePool` on `GloamVaultSwapV4b`
   for each pool. That stops swaps through it from any client. A swap still in flight
   reverts and its note stays safe, and refunds keep working, because they never touch a
   pool. It is a transaction per pool, and can't be undone except through the 3-day queue.

`GloamVaultSwapV4` and `GloamVaultSwapTempo` have no owner and can't be closed. They
stay callable for good by anyone holding a valid proof. That is harmless: they can only
do what they do now.

## Ethereum: what a swap costs

Real proofs against the live vault, on a fork (`app/scripts/fork-router-v3.mts`):

| | Gas |
| --- | --- |
| A swap, stablecoins or ETH | 1.58M to 1.68M |
| A refund | 1.18M |
| An exit | 145k |

The relay pays. At $2,250 ETH a swap costs about **$3.71 per gwei**.

| Gas price | One swap | Fee on $100 at 0.50% | Fee on $500 at 0.50% |
| --- | --- | --- | --- |
| 0.04 gwei | $0.15 | $0.50, keeps $0.35 | $2.50, keeps $2.35 |
| 0.15 gwei | $0.56 | $0.50, **loses $0.06** | $2.50, keeps $1.94 |
| 0.67 gwei | $2.49 | **loses $1.99** | breaks even |
| 1 gwei | $3.71 | **loses $3.21** | **loses $1.21** |
| 3 gwei, the relay's ceiling | $11.14 | **loses $10.64** | **loses $8.64** |

Against the fee alone, a swap of $S breaks even at `S / 742` gwei. On a calm day Ethereum
pays, except for small swaps. On a busy day it loses on every swap, and $500 is the
largest one the vault takes today. The price buffer goes to the treasury as well and
helps a little (0.1% on stablecoin pairs), but it is meant for price moves, so these
numbers leave it out.

**Ethereum stays off, by decision.** The router deploys there and is built and tested, and
`ETHEREUM_PRIVATE_SWAPS` in `app/src/lib/vaultSwap.ts` keeps it off even if
`VAULT_SWAP_V3_LIVE[1]` is set. There is no smallest swap and no per-swap gas check, and
none is planned for now. So turning it on would be a new decision, not a step in this
runbook: the relay's only limit there is its gas ceiling, and at that ceiling every swap
loses money.

## What to review first

1. `GloamVaultSwap2.exit` and `exitDigest`: who can take the money, and whether anything
   public can stand in for the exit key.
2. `_open` and the `OPENING` state: `receive()` takes ETH from any sender in that state.
3. `GloamVaultSwapV4c._walk` and `unlockCallback`: conversion between ETH and WETH at
   the ends of a route, and that a pool can still take no more than the leftover.
4. `SwapEscrow2`: a new init code. Every escrow address depends on it.
5. The escrow key, now ten fields: what it fixes, and that the app and the router hash
   it the same way. The deadline: that it stops a swap, and only a swap.
6. The Base and Ethereum pool lists against live state on the day.
7. The deploy page: that what it signs is what was reviewed.
