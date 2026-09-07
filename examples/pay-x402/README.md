# pay-x402

A private agent payment over x402, end to end, using only `@gloamtrade/sdk`.

A seller prices a resource (the HTTP 402 challenge). A buyer agent shields a note
to fund itself, builds a private payment of the required amount to the payee,
broadcasts the shielded transfer itself, presents the `X-PAYMENT` header, and the
seller verifies it before granting access. The amount and the parties never go on
the public feed.

This is the pattern that won Colosseum (x402 paired with stablecoins) with the
settlement made private and self-custodial. It is **not** a Tempo Zone: no
operator sees the payment; only the payer and the payee learn the amount, and
compliance visibility is opt-in per payment through an issuer-scoped disclosure.

## Run

```bash
GLOAM_PAY_KEY=0x<funded RH testnet key> npx tsx examples/pay-x402/pay-x402.ts
```

Needs a funded Robinhood testnet key, `snarkjs`, and the shield + transfer circuit
artifacts (reused from `app/public/circuits`).

The demo settles on Robinhood testnet with native ETH because that pool is live.
On Tempo the identical flow settles a stablecoin; only the asset and the chain
config change. See [`TEMPO_EXPANSION.md`](../../TEMPO_EXPANSION.md).

## What it shows

1. `buildGloamPaymentRequirements` builds the 402 challenge.
2. `buildShieldBoundIntent` funds the buyer with a private note.
3. `syncTree` rebuilds the pool tree and returns the note's membership path.
4. `buildGloamPayment` builds the private send plus the `X-PAYMENT` header and an
   optional issuer-scoped compliance disclosure. The agent broadcasts the
   transfer itself and attaches the tx hash.
5. `verifyGloamPayment` confirms the payment note binds the required amount and
   asset, then the seller runs the listed on-chain checks (including
   `commitmentSeen` for note membership).
