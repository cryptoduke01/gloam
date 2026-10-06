# mpp-gloam

A paid API over the [Machine Payments Protocol](https://mpp.dev), charged per request with the private `gloam` method, and an agent that pays it. Built on `mppx` and `@gloamtrade/mppx-gloam`.

```bash
pnpm --filter gloam-mpp-example start                   # stub proofs, a few seconds
pnpm --filter gloam-mpp-example start -- --real-proofs  # real Groth16 transfer proofs, each verified
```

Runs against a mock pool in memory that applies the Gloam pool's transfer rules (known root, nullifier spent once, fresh commitments, a `Transferred` log). Nothing is broadcast. `--real-proofs` uses the transfer circuit in `app/public/circuits` and checks every proof against `contracts/circuits/build/transfer_v2/transfer_vkey.json`.

## What happens

1. `GET /answer` with no payment: `402` with `WWW-Authenticate: Payment method="gloam", intent="charge"`, priced at 0.01 PathUSD on Tempo, payable to the seller's receive tag, through the official Tempo pool.
2. The agent pays in **push** mode: it checks the price against its policy, proves a private send of exactly 0.01 from its shielded balance, seals the payment note to the seller, broadcasts the transfer, and retries with `Authorization: Payment …`. The seller checks the payment and the `Transferred` event, sweeps it into a fresh note, and only then serves. `200` with a `Payment-Receipt`.
3. The agent pays in **pull** mode: it broadcasts nothing. The seller submits the agent's proven transfer, then sweeps.
4. The same credential again: `402 verification-failed`, already used.
5. The public feed: four `Transferred` events, a nullifier and two commitments each. No amounts, no tags.

## Files

| File | Role |
|---|---|
| `server.ts` | The seller: Hono + `mppx/hono` with `gloam()` from `@gloamtrade/mppx-gloam/server`, and a tiny `node:http` adapter |
| `client.ts` | The buyer: `mppx/client` with `gloam()` from `@gloamtrade/mppx-gloam/client`, and a minimal note wallet |
| `mock-pool.ts` | The mock chain |
| `demo.ts` | Wires them together over real HTTP on localhost |

## Going live

Swap the mock for the chain: `gloamChargeChainFromClient(publicClient, { pool, fromBlock })` for reads, a wallet or the Gloam relay (`relayIntent`) to submit, `artifactProver(...)` to prove, and `syncTree` for the agent's note paths. Keep the seller's receive key and fresh notes server side, set `MPP_SECRET_KEY`, and serve over TLS.
