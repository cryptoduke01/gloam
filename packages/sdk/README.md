# @gloamtrade/sdk

The private path for Robinhood Chain, as a reusable package. Shielded balances,
private payments, and selective disclosure that any RH Chain app or agent plugs
into.

Testnet only, real ZK proofs, no mock fills. If a path cannot be private yet, it
waits.

The pure crypto/math core runs anywhere; the environment-bound parts (snarkjs
proving, note storage, RPC) are injected, so one core serves the browser [vault
app](https://gloam.trade/app) and a Node agent alike.

## Install

```bash
npm install @gloamtrade/sdk viem
# snarkjs is an optional peer, needed only for proving (shieldBound, unshield, …)
npm install snarkjs
```

The package ships TypeScript source consumed through your bundler (Next
`transpilePackages`, Vite, tsx, etc.), the same way the reference app uses it.

## Quickstart: shield privately

The hardened pool enforces a proof at deposit (audit C1), so plain `shield()`
reverts. `buildShieldBoundIntent` mints the note **and** generates the shield
proof; you just sign the resolved call.

```ts
import { buildShieldBoundIntent, artifactProver } from "@gloamtrade/sdk";
import { parseEther } from "viem";

const intent = await buildShieldBoundIntent({
  amountWei: parseEther("0.001"),
  // node paths or browser URLs to the shield circuit artifacts
  prover: artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" }),
});

// intent.exec === { poolAddress, fn: "shieldBound", valueWei, args } — a ready
// call. intent.note.secret is the spend key; PERSIST IT.
await wallet.writeContract({
  address: intent.exec.poolAddress,
  abi: shieldPoolAbi,
  functionName: intent.exec.fn,
  args: intent.exec.args,
  value: intent.exec.valueWei,
});
```

A complete runnable agent is in
[`examples/agent-shield`](../../examples/agent-shield).

## What's here

| Module | Exports |
| --- | --- |
| **intents / builders** | `buildShieldIntent`, `buildShieldBoundIntent`, and the unshield / transfer / sealed-swap builders. Each returns an unsigned `GloamIntent` (portable plan + resolved on-chain `exec`). |
| **note** | `makeBoundNotePoseidon`, `noteCommitmentPoseidon`, `noteNullifierPoseidon` — the `commitment = Poseidon(secret, amount, asset)` scheme. |
| **merkle** | depth-20 incremental tree + circom path builder. |
| **witness / prove** | circom witness builders + `proveGroth16` / `artifactProver` (snarkjs, injected). |
| **rates / privacy** | sealed-rate math + the size-privacy floor policy (pure). |
| **constants** | `SEALED_VAULT` (hardened pool), `SHIELD_VERIFIER`, `NATIVE_ASSET`, chain ids. |

## Selective disclosure

Prove you hold a specific shielded balance to a party you choose, revealing
nothing else. Reuse the shield proof: it binds a commitment to `(amount, asset)`
without exposing the secret. The verifier checks the proof and confirms the
commitment is a live note via `pool.commitmentSeen`. The vault app implements this
at `/app/disclose` (mint) and `/verify` (check, no wallet).

## Injected adapters

Proving and storage are environment-bound, so they are passed in:

- **Prover** — `artifactProver({ wasm, zkey })` binds snarkjs to your circuit
  artifacts (file paths in Node, URLs in the browser).
- **Note store / keys** — bring your own; a note is `{ secret, commitment,
  amount, asset }` and the secret is the only spend authority.

## Publishing

```bash
pnpm --filter @gloamtrade/sdk build   # emits dist/ (JS + .d.ts)
pnpm --filter @gloamtrade/sdk test    # core self-tests
npm publish --access public      # requires the @gloam npm org
```

## Guardrails

Testnet `46630` only. The default `SEALED_VAULT` is the hardened C1/C2/C3 pool,
never the retired `0x4F38` pool. Real privacy only.
