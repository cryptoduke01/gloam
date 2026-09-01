# gloam-pay-bot

A payments bot that sends a **private payment** on Robinhood Chain using only
[`@gloam/sdk`](../../packages/sdk). It is the smallest end-to-end example of the
spend path: shield, sync the tree from chain, and transfer privately.

## What it does

1. **Shields** a note to fund itself (`buildShieldBoundIntent` + a real shield proof).
2. **Rebuilds the pool tree** from chain with `syncTree`, and checks the root
   against the pool's on-chain `currentRoot()` before trusting it.
3. **Sends privately** with `buildPrivateSendIntent`: it spends the funding note
   and produces two new notes — a payment note for the recipient and a change
   note for itself. There is no public transfer and no visible amount.
4. Prints the **payment note** to hand the recipient (they open or cash it out)
   and the **change note** to keep.

## Run

```bash
GLOAM_PAY_KEY=0x<funded RH testnet key> npx tsx pay-bot.ts
```

You need:

- A funded Robinhood Chain testnet key (chain id `46630`). Get test ETH from the
  [faucet](https://faucet.testnet.chain.robinhood.com/).
- `snarkjs` installed (it is a dependency here).
- The shield + transfer circuit artifacts — reused from `app/public/circuits/`
  via relative paths, so run from the repo.

## What stays private

The transfer emits only a nullifier and two new commitments. The amount, the
sender/recipient link, and which note was spent are all hidden. Shielding itself
is a public deposit (the deposit amount is visible); everything after it is not.

## Notes

- Testnet only, with dev-ceremony proving keys.
- Persist `paymentNote.secret` and `changeNote.secret` — they are the only spend
  authority for those balances.
- See [`examples/agent-shield`](../agent-shield) for the deposit-only path, and
  the [SDK docs](https://gloam.trade/docs/sdk) for the full surface.
