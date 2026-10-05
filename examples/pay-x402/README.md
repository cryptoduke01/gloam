# pay-x402

A private agent payment over x402, end to end, using only `@gloamtrade/sdk`.

A seller prices a resource (the HTTP 402 challenge) and names its receive tag as
`payTo`. A buyer agent shields a note to fund itself, builds a private payment of
the required amount, seals the payment note to the seller's tag, broadcasts the
shielded transfer itself, and presents the `X-PAYMENT` header. The seller opens
the payment, verifies it, and sweeps it into a fresh note only the seller knows.
It grants access only after that sweep confirms. The amount and the parties never
go on the public feed.

This is the pattern that won Colosseum (x402 paired with stablecoins) with the
settlement made private and self-custodial. It is **not** a Tempo Zone: no
operator sees the payment; only the payer and the payee learn the amount, and
compliance visibility is opt-in per payment through an issuer-scoped disclosure.

## Run

```bash
GLOAM_PAY_KEY=0x<funded RH testnet key> npx tsx examples/pay-x402/pay-x402.ts
```

Needs a funded Robinhood testnet key, `snarkjs`, and the shield + transfer circuit
artifacts (reused from `app/public/circuits`). The one key plays both sides here:
it funds the buyer and signs the seller's sweep. Set `GLOAM_RELAY_URL` to sweep
through the Gloam relay instead.

The demo settles on Robinhood testnet with native ETH because that pool is live.
On Tempo the identical flow settles a stablecoin; only the asset and the chain
config change. See [`TEMPO_EXPANSION.md`](../../TEMPO_EXPANSION.md).

## What it shows

1. `generateReceiveKey` gives the seller a receive tag; `buildGloamPaymentRequirements`
   builds the 402 challenge with that tag as `payTo` (anything else is refused).
2. `buildShieldBoundIntent` funds the buyer with a private note.
3. `syncTree` rebuilds the pool tree and returns the note's membership path.
4. `buildGloamPayment` builds the private send plus the `X-PAYMENT` header, with
   the payment note sealed to the seller's tag, and an optional issuer-scoped
   compliance disclosure. The agent broadcasts the transfer itself and attaches
   the tx hash.
5. `settleGloamPayment` opens the note with the seller's key, checks it binds the
   price and asset in the right pool, and sweeps it into a fresh note only the
   seller knows. `grantAccess` is true only once the sweep confirms.

## Why the sweep

The buyer creates the payment note, so it knows the note's secret too. If the
seller served right after a plain verify, the buyer could spend the note back
before the seller moved it. The sweep closes that: once it confirms, the money
sits under a secret the buyer never saw. If the buyer got there first, the sweep
fails with `already_spent` and the seller does not serve. `verifyGloamPayment` on
its own says so in its result (`final: false`).
