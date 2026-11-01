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
| Robinhood Chain | `0xbDEaC20a1Dfa892cac839a3C911d403aF6968e05` | 45 | 4.6M |
| Base | `0xdc88B3bF0d7cB48B7d4062572dC5fC8D2a8147C6` | 7 | 3.5M |
| Ethereum | `0xE2cC7C7f521D12Da0E2FAd2153b351515637dF0A` | 13 | 3.7M |
| Tempo | `0xb88794079d0DdC5b4327b49056b3761F389A9fDf` | no pools, its DEX | see the card |

These hold for the contracts in `test/fixtures/router-next.json`, which
`test_v3_predicted_addresses_are_pinned` checks.

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

1. Switch the app and relay to the new router. New quotes go to it.
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

**So Ethereum stays off.** The router deploys there and is built and tested, and the app
keeps it switched off. Before turning it on, the relay should refuse a swap whose gas
would cost more than the swap's fee, and pick a smallest swap. A flat gas ceiling is
not enough: the same gas price pays on $500 and loses on $50.

## What to review first

1. `GloamVaultSwap2.exit` and `exitDigest`: who can take the money, and whether anything
   public can stand in for the exit key.
2. `_open` and the `OPENING` state: `receive()` takes ETH from any sender in that state.
3. `GloamVaultSwapV4c._walk` and `unlockCallback`: conversion between ETH and WETH at
   the ends of a route, and that a pool can still take no more than the leftover.
4. `SwapEscrow2`: a new init code. Every escrow address depends on it.
5. The escrow key, now nine fields: what it fixes, and that the app and the router hash
   it the same way.
6. The Base and Ethereum pool lists against live state on the day.
7. The deploy page: that what it signs is what was reviewed.
