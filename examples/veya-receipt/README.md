# veya-receipt

The leaf [VEYA](https://veyanet.tech) anchors for one Gloam payment: a receipt
hashes into one `bytes32` with `paymentReceiptLeaf` from `@gloamtrade/sdk`, and
that `bytes32` goes to `storeCommitment` on `Veya.sol`. The amount and the payee
are not in the leaf.

This is the record kept after a payment. The check before a payment is a
separate thing, in the MCP server: see
[Check the budget before paying](../../mcp/README.md#check-the-budget-before-paying-veya).

## Run it

```bash
# from the repo root
pnpm install
npx tsx examples/veya-receipt/veya-receipt.ts
```

That is a dry run on a sample record that is not a real payment: no keys, no
network, nothing sent. It prints the `storeCommitment` call and the leaf. Pass a
record of your own to hash that instead. A record comes from
`buildPaymentReceipt`, and [`examples/san-verano`](../san-verano) makes one end
to end:

```bash
VEYA_ENVIRONMENT_UUID=0x... npx tsx examples/veya-receipt/veya-receipt.ts record.json
```

## Anchor for real

The script takes no key and never sends. `anchorReceipt` takes anything with a
`storeCommitment` method, and `EvmAnchor` from `@veyanet/sdk` has that method
with these arguments. Run this on your own machine:

```ts
import { EvmAnchor } from "@veyanet/sdk";
import { anchorReceipt } from "./veya-receipt.ts";

const anchor = new EvmAnchor({ payerPrivateKey: process.env.VEYA_ANCHOR_KEY! });
const { leaf, tx } = await anchorReceipt(anchor, environmentUuid, record);
```

`@veyanet/sdk` is not a dependency of this repo, so add it yourself. It is on
mainnet unless you pass `network: "testnet"` or set `ROBINHOOD_NETWORK=testnet`.

- **Use a throwaway wallet that holds only gas.** It signs every anchor, and each
  anchor is a public transaction from that address. Never use the agent's wallet
  or a wallet that holds funds, and do not fund it from the agent's wallet, or
  the chain links the two.
- **Anchor locally, with VEYA's SDK.** VEYA's hosted MCP write tools take a
  private key (`payerPrivateKey`). Do not send one to a hosted tool, not even the
  throwaway's, and never send a note secret anywhere.

## What to know

- **The environment comes first.** `storeCommitment` takes a `bytes16`
  environment uuid that must already be registered (`EvmAnchor.registerEnvironment`).
- **One leaf, one anchor.** `Veya.sol` keys commitments by their value, so
  anchoring the same leaf twice reverts with `CommitmentAlreadyExists`.
- **The time is public.** An anchor shows when it was sent. Sending it right after
  a payment ties it to that moment, so batch or delay anchors if that matters.
- **What a leaf proves.** Anyone holding the record can check it with
  `checkPaymentReceipt`: a private payment of that asset and at least that amount
  was made by that transaction. It does not show who received it, because the
  payer picks the payment note's key. `Veya.sol` does not check the leaf, it only
  stores it.
- **Keep the record off chain.** It holds the transaction hash and the receipt's
  public signals. Put only the leaf on chain.
