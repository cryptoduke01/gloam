# @gloamtrade/mppx-gloam

Private payments for the [Machine Payments Protocol](https://mpp.dev) (MPP).

MPP is HTTP 402 done properly: a server answers `WWW-Authenticate: Payment …`, the client pays and retries with `Authorization: Payment …`, and gets a `Payment-Receipt`. Every method so far (tempo, evm, stripe, solana) settles in public, so the ledger shows which agent paid which service, how much, how often.

This package adds the **`gloam`** method. A charge is paid with a private transfer inside a Gloam shielded pool on Tempo or Robinhood Chain:

- the payment note is sealed to the payee's receive tag, so only the payee can open it;
- the server checks it binds the price, that it is the payment output of a `Transferred` event in the official pool, and that the credential is bound to this exact challenge;
- the server sweeps the payment into a fresh note only it knows, and serves only after that sweep confirms (until then the payer, who created the note, could spend it back);
- the public chain sees shielded transfers: a nullifier and two commitments each. No amount, no asset, no payer, no payee.

Spec: [`docs/mpp/draft-gloam-charge-00.md`](../../docs/mpp/draft-gloam-charge-00.md).

## Server (mppx)

```ts
import { Mppx } from "mppx/server";
import { gloam } from "@gloamtrade/mppx-gloam/server";
import { gloamChargeChainFromClient } from "@gloamtrade/mppx-gloam/core";
import { artifactProver, relayIntent, GLOAM_NETWORKS } from "@gloamtrade/sdk";

const tempo = GLOAM_NETWORKS.tempo;
const mppx = Mppx.create({
  secretKey: process.env.MPP_SECRET_KEY!,
  methods: [
    gloam({
      network: "tempo",                                   // PathUSD by default
      receiveKey,                                         // from generateReceiveKey(), stored server side
      chain: gloamChargeChainFromClient(publicClient, { pool: tempo.pool, fromBlock: tempo.deployBlock }),
      prove: artifactProver({ wasm: "transfer.wasm", zkey: "transfer_final.zkey" }),
      submit: (intent) => relayIntent(intent),            // or your own wallet: writeContract(...)
      beforeSubmit: (freshNote) => saveNote(freshNote),   // the money: persist before the sweep goes out
    }),
  ],
});

export async function handler(request: Request) {
  const r = await mppx.charge({ amount: "0.01" })(request);
  if (r.status === 402) return r.challenge;
  return r.withReceipt(Response.json({ answer: 42 }));
}
```

With Hono: `import { Mppx } from "mppx/hono"` and `app.get("/answer", mppx.charge({ amount: "0.01" }), handler)`.

Options: `modes: ["push"]` or `["pull"]` to accept one submission mode (default both), `replay` for a shared replay store when several instances settle (default in memory), `pools` only for a private deployment you trust.

## Client (mppx)

```ts
import { Mppx } from "mppx/client";
import { gloam } from "@gloamtrade/mppx-gloam/client";
import { artifactProver, relayIntent, TEMPO_PATHUSD } from "@gloamtrade/sdk";

const mppx = Mppx.create({
  polyfill: false,
  methods: [
    gloam({
      getNote: ({ amountWei, currency }) => wallet.noteCovering(amountWei, currency), // { secret, amountWei, path }
      prove: artifactProver({ wasm: "transfer.wasm", zkey: "transfer_final.zkey" }),
      mode: "auto",                                       // pull when offered, else push
      submit: (intent) => relayIntent(intent),            // only needed for push
      policy: { maxAmountWei: 50_000n, currencies: [TEMPO_PATHUSD] },
      beforeSubmit: (built) => wallet.keep(built.changeNote),
    }),
  ],
});

const res = await mppx.fetch("https://api.example.com/answer");
```

The client refuses, before proving anything, a pool that is not Gloam's for that chain, a recipient that is not a receive tag, and anything outside `policy`.

## Without an MPP library

`@gloamtrade/mppx-gloam/core` has the whole method with no `mppx` dependency:

```ts
import { createGloamPaywall, createGloamChargeCredential, parsePaymentChallenges, isGloamChargeChallenge } from "@gloamtrade/mppx-gloam/core";

// Server: same handler shape as mppx.
const paywall = createGloamPaywall({ secretKey, server: { receiveKey, chain, prove, submit } });
const r = await paywall.charge({ amount: "0.01" })(request);

// Client.
const [challenge] = parsePaymentChallenges(res.headers.get("www-authenticate")).filter(isGloamChargeChallenge);
const { authorization } = await createGloamChargeCredential({ challenge, note, prove, mode: "pull" });
await fetch(url, { headers: { Authorization: authorization } });
```

It also exports the Payment scheme codec (challenges, credentials, receipts, the HMAC challenge id, byte compatible with mppx), `validateGloamCharge` (read-only checks) and `settleGloamCharge` (sweep and receipt).

## Push or pull

| | push | pull |
|---|---|---|
| Who broadcasts the payer's transfer | the payer (its wallet or the Gloam relay) | the server |
| Payer needs gas / a wallet on chain | yes (unless relayed) | no |
| If the server refuses | the value already moved (sealed to the payee) | nothing moved |
| What the server learns | the payer's sending address, unless relayed | nothing about the payer's wallet |

## Status

Testnet: Tempo Moderato (42431) and Robinhood Chain testnet (46630) pools, development proving keys. Not published to npm yet.

## Tests

```bash
pnpm --filter @gloamtrade/mppx-gloam test
```

Runs against an in-memory pool that applies the pool's transfer rules: wire codec (spec HMAC vectors, mppx interop both ways), push and pull end to end, replay, a credential lifted onto another challenge, wrong keys, amounts, assets, pools and events, a payer who spends the payment back, lost sweep receipts, concurrency, the Fetch paywall, and `Mppx.create` on both sides.
