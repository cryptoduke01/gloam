# @gloam/sdk

The private path for Robinhood Chain, as a reusable package. Shielded balances,
private transfers, and private trades that any RH Chain app or agent can plug into.

Testnet only, real privacy only. If a path cannot be private yet, it waits.

## Status

Milestone 1 (buildathon). Scaffolding in progress. The canonical intent contract
(`GloamIntent`, `PUBLIC_INPUTS`) is live; the pure note / Merkle / prover modules
are being ported from the Gloam app in behavior-preserving batches. The vault app
is the reference implementation of this SDK.

## Install (workspace)

```bash
pnpm --filter @gloam/sdk build
```

## What ships here

- Canonical intents shared with `@gloam/mcp`: `shield`, `privateSend`, `unshield`,
  `privateTrade`. Each builds an unsigned intent; the plan layer is portable
  (USD / symbol, no secrets), the exec layer resolves the on-chain call.
- Pure crypto core: note commitment + nullifier (Poseidon), incremental Merkle
  tree, circom witness builders, groth16 proof packing.
- Adapters for the environment-bound parts: note storage, viewing keys, snarkjs
  artifact loading, and RPC — injected, so one core serves browser and node.

## Quickstart

Build an unsigned shield intent (real Poseidon note commitment, ready-to-sign
exec args). No chain call, so it is safe to run anywhere:

```bash
pnpm --filter @gloam/sdk build
node examples/shield-intent.mjs
```

```ts
import { buildShieldIntent } from "@gloam/sdk";

const intent = await buildShieldIntent({ amountWei: 10_000_000_000_000_000n }); // 0.01 ETH
// intent.exec = { poolAddress, fn: "shield", valueWei, args: [asset, amount, commitment] }
// intent.note.secret must be persisted to spend the note later.
```

Sign `intent.exec` with any wallet or the agent server and broadcast on RH
testnet. The `privateSend`, `unshield`, and `privateTrade` builders (which carry
a Groth16 proof) land as the prover core finishes porting.

Contracts of record (RH testnet `46630`):

- Sealed vault `ShieldPoolPoseidon` `0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F`
- Pay memo `GloamPayMemo` `0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE`
