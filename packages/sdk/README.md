# @gloamtrade/sdk

**The privacy layer for Robinhood Chain, as a package.**

Add shielded balances, private payments, and selective disclosure to any Robinhood Chain app or agent. Real zero-knowledge proofs, no proving stack to build from scratch.

[![npm version](https://img.shields.io/npm/v/@gloamtrade/sdk?color=3B3766&label=npm)](https://www.npmjs.com/package/@gloamtrade/sdk)
[![license](https://img.shields.io/npm/l/@gloamtrade/sdk?color=3B3766)](https://github.com/cryptoduke01/gloam/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/@gloamtrade/sdk?color=3B3766)](https://www.npmjs.com/package/@gloamtrade/sdk)
[![Robinhood Chain](https://img.shields.io/badge/chain-Robinhood%20testnet%2046630-2E7D53)](https://gloam.trade/docs/testnet)

![The Gloam SDK](https://raw.githubusercontent.com/cryptoduke01/gloam/main/app/public/media/readme-hero.jpg)

---

## Table of contents

- [Why Gloam](#why-gloam)
- [What you can build](#what-you-can-build)
- [Install](#install)
- [Quickstart: shield your first note](#quickstart-shield-your-first-note)
- [How it works](#how-it-works)
- [The intent model](#the-intent-model)
- [Cash out (unshield)](#cash-out-unshield)
- [Private payments (transfer)](#private-payments-transfer)
- [Selective disclosure](#selective-disclosure)
- [Private agents](#private-agents)
- [Private agent payments (x402)](#private-agent-payments-x402)
- [API reference](#api-reference)
- [Framework integration](#framework-integration)
- [Examples](#examples)
- [Pinned public inputs](#pinned-public-inputs)
- [Guardrails and honesty](#guardrails-and-honesty)
- [Links](#links)

---

## Why Gloam

Robinhood Chain is a public ledger. Every balance, position size, and trade is visible on-chain and copyable by anyone. For a trader that means the whole book is exposed. For an agent it means the entire strategy leaks on the first move.

Gloam is the shielded layer on top of Robinhood Chain, and `@gloamtrade/sdk` is that layer as a dependency. Deposit into a private balance, move value with the amount hidden, and prove a holding to one chosen party without revealing anything else. Every private action is backed by a real Groth16 proof verified on-chain. Nothing is a mock. If a path cannot be made private, it stays disabled rather than pretending.

The Gloam vault app is the reference implementation, not a special case. The same core that powers it is what you install here.

## What you can build

- **Shielded balances.** Deposit ETH or tokenized stocks into a private balance only the holder can see or spend.
- **Private payments.** Send inside the vault to a receive tag, with on-chain encrypted discovery. No public transfer, no visible amount.
- **Cash out.** Unshield back to a public balance with a browser- or node-generated Groth16 proof.
- **Selective disclosure.** Let a holder prove one balance to a chosen party, an auditor or a counterparty, revealing nothing else. Provable, not a dark pool.
- **Private agents.** The same core runs server-side, so an autonomous agent can hold and move value under policy with its size and strategy hidden.
- **Private agent payments (x402).** Agents pay for tools and data over HTTP 402 and settle privately, so the amount, sender, and recipient never go public.

## Install

```bash
npm install @gloamtrade/sdk viem
npm install snarkjs   # optional peer, needed only when you generate proofs
```

`viem` handles signing and RPC. `snarkjs` is a lazy peer, imported dynamically only inside the prover, so it is required only for paths that generate a proof (shield, unshield, transfer, disclosure).

Prefer to start from a working app instead of wiring it yourself:

```bash
npm create gloam-app@latest my-private-app
```

That scaffolds a Next.js app already wired to the SDK. See [create-gloam-app](https://www.npmjs.com/package/create-gloam-app).

## Quickstart: shield your first note

The hardened pool enforces a proof at deposit, so `buildShieldBoundIntent` mints the note **and** generates the shield proof. You sign the resolved call. The `note.secret` it returns is the only spend authority, so persist it.

```ts
import { buildShieldBoundIntent, artifactProver, RH_TESTNET_CHAIN_ID } from "@gloamtrade/sdk";
import { createWalletClient, http, parseEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rhTestnet = defineChain({
  id: RH_TESTNET_CHAIN_ID, // 46630
  name: "Robinhood Chain testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
});

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: rhTestnet, transport: http() });

// 1. Mint the note and generate the shield proof.
const intent = await buildShieldBoundIntent({
  amountWei: parseEther("0.001"),
  prover: artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" }),
});

// 2. Sign and broadcast the resolved shieldBound(asset, amount, commitment, proof) call.
const hash = await wallet.writeContract({
  address: intent.exec.poolAddress,
  abi: shieldBoundAbi,
  functionName: intent.exec.fn,   // "shieldBound"
  args: intent.exec.args,
  value: intent.exec.valueWei,    // the deposit for native ETH, 0n for tokens
});

// 3. PERSIST THIS. Losing note.secret loses the funds.
saveSecret(intent.note.commitment, intent.note.secret);
```

The minimal ABI fragment for the one call you make:

```ts
const shieldBoundAbi = [{
  type: "function", name: "shieldBound", stateMutability: "payable",
  inputs: [
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "commitment", type: "bytes32" },
    { name: "proof", type: "bytes" },
  ],
  outputs: [],
}] as const;
```

Circuit artifacts (`shield.wasm`, `shield_final.zkey`) are served at [www.gloam.trade/circuits](https://www.gloam.trade/circuits). Pass file paths in node or URLs in the browser. The full walkthrough, including confirming the deposit and cashing out, is in the [quickstart](https://gloam.trade/docs/quickstart).

## How it works

A private balance is a **note**:

```
commitment = Poseidon(secret, amount, asset)
nullifier  = Poseidon(secret, commitment)
```

Shielding inserts the `commitment` as a leaf in a depth-20 incremental Merkle tree. The `secret` is the only spend authority and never leaves the client. Spending (send, cash out, trade) proves in zero knowledge that you know the secret for a commitment in the tree, and publishes the `nullifier` so it cannot be spent twice, all without revealing which note. The chain verifies a Groth16 proof, never your identity or size.

The note commitment binds the asset, so it works for tokenized stocks, not just ETH. That binding is what makes this a privacy layer for a stock-paired chain rather than a generic ETH mixer.

## The intent model

Every action is an **intent** with two layers. The **plan** is portable and safe to log or hand to an agent (symbol, amount, no secrets). The **exec** resolves the on-chain call (wei amounts, resolved addresses, proof args). The SDK and the agent server share one intent shape, so a plan an app builds and a plan an agent builds are the same object.

```ts
interface GloamIntent<K> {
  intent: K;                  // "shield" | "unshield" | "private_send" | "private_trade"
  chainId: number;
  agentAddress: Address | null;
  plan: PlanFor<K>;           // portable: symbol, amount, no secrets
  privacy: string;            // plain-language: what is and is not hidden
  execution: string;          // plain-language: how to sign and broadcast
  exec: IntentExec;           // the resolved on-chain call
}

interface IntentExec {
  poolAddress: Address;
  fn: PoolFn;                 // e.g. "shieldBound", "unshield", "transfer"
  valueWei: bigint;           // ETH to attach (native shield only)
  args: readonly unknown[];   // ABI-ordered call args
}
```

You always sign and broadcast yourself. The SDK never holds a key.

## Cash out (unshield)

A spend needs a membership path, which needs the current tree. `syncTree` rebuilds it from chain (replaying `Shielded`, `Transferred`, and `SealedSwapped` leaves in order, so the root stays correct after any transfer). Then `buildUnshieldIntent` builds the witness and the proof. On exit, the amount, asset, and recipient become public. The source note stays unlinkable via the nullifier.

```ts
import { buildUnshieldIntent, artifactProver, syncTree, SEALED_VAULT } from "@gloamtrade/sdk";

const synced = await syncTree(publicClient, { pool: SEALED_VAULT, fromBlock });
const path = await synced.pathForCommitment(note.commitment);
if (!path) throw new Error("note not found in the tree yet");

const exit = await buildUnshieldIntent({
  secretHex: note.secret,
  amountWei: parseEther("0.001"),
  to: account.address,
  path,
  prove: artifactProver({ wasm: "unshield.wasm", zkey: "unshield_final.zkey" }),
});

await wallet.writeContract({
  address: exit.exec.poolAddress,
  abi: unshieldAbi,
  functionName: exit.exec.fn,     // "unshield"
  args: exit.exec.args,
});
```

## Private payments (transfer)

`buildPrivateSendIntent` spends a note and produces two new notes: a payment note for the recipient and a change note for the sender. There is no public transfer and no visible amount.

```ts
import { buildPrivateSendIntent, artifactProver, syncTree, SEALED_VAULT } from "@gloamtrade/sdk";

const synced = await syncTree(publicClient, { pool: SEALED_VAULT, fromBlock });
const path = await synced.pathForCommitment(note.commitment);

const send = await buildPrivateSendIntent({
  secretHex: note.secret,
  amountInWei: note.amountWei,     // the source note's amount
  amountPayWei: parseEther("0.001"), // amount to send; the rest is your change
  path,
  prove: artifactProver({ wasm: "transfer.wasm", zkey: "transfer_final.zkey" }),
});

await wallet.writeContract({
  address: send.exec.poolAddress,
  abi: transferAbi,
  functionName: send.exec.fn,       // "transfer"
  args: send.exec.args,
});

// Hand send.paymentNote to the recipient; keep send.changeNote.
```

## Selective disclosure

Private by default, provable by choice. A holder proves one shielded balance to a party they choose, revealing nothing about their identity, their other notes, or the note secret (so the disclosure can never move the funds). It reuses the shield circuit, so there is no extra setup, and it verifies in-browser with no wallet. See the [disclosure guide](https://gloam.trade/docs/sdk/disclosure).

## Private agents

The crypto core is pure and isomorphic, so the exact code above runs server-side. An AI agent can shield, pay, and prove holdings with its size and strategy hidden. Two ways in:

- **Directly via `@gloamtrade/sdk`.** Your agent framework builds an intent and signs it with its own wallet.
- **Via the `@gloamtrade/mcp` server.** An MCP-speaking model gets Gloam as tools alongside its other capabilities, with planning and execution kept separate and keys held server-side.

See [Build a private agent](https://gloam.trade/docs/agents).

## Private agent payments (x402)

Agents pay for tools and data over HTTP 402. The pattern that won Colosseum (MCPay) paired x402 with stablecoins, but that settlement is fully public: the amount, the payer, and the payee all leak. Gloam's `gloam-private` scheme keeps the settlement private and self-custodial. The agent settles a shielded transfer to the payee itself (no operator or facilitator ever holds its key or funds), then presents the payment note plus the settlement tx as proof on the 402 retry.

```ts
import {
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  artifactProver,
} from "@gloamtrade/sdk";

// Server: price a resource. This is the 402 challenge.
const requirements = buildGloamPaymentRequirements({
  amountWei: parseUnits("0.25", 18),
  asset: USD_TOKEN,          // a stable asset; omit for the chain's native unit
  assetSymbol: "USD",
  payTo: "gloam:rcpt:...",   // payee receive tag
  resource: "mcp://tool/summarize",
});

// Agent: build the private payment, broadcast it, then present the header.
const pay = await buildGloamPayment({
  requirements,
  senderSecretHex: note.secret,
  senderNoteAmountWei: note.amountWei,
  path,                                  // from syncTree.pathForCommitment
  prove: artifactProver({ wasm, zkey }), // transfer artifacts
  issuerTag: "issuer:usd",               // optional issuer-scoped compliance disclosure
});
const hash = await wallet.writeContract({ ...pay.intent.exec }); // agent self-settles
pay.payload.payload.txHash = hash;

// Server: verify before granting access, then run the listed on-chain checks.
const v = verifyGloamPayment({ requirements, payload: pay.payload });
// v.ok, plus v.onchainChecksRequired: note membership, tx landed, nullifier single-use.
```

**This is not a Tempo Zone.** A Zone is operator-visible: the zone operator sees every transaction inside it. Gloam is private from the public and from any operator; only the payer and the payee learn the amount. Compliance visibility is opt-in per payment via `buildComplianceDisclosure`, an issuer-scoped disclosure that reuses the shield-circuit proof rather than handing an operator a blanket view. See [`TEMPO_EXPANSION.md`](https://github.com/cryptoduke01/gloam/blob/main/TEMPO_EXPANSION.md).

## API reference

Everything exports from one barrel. The crypto and math core is pure and runs anywhere. Proving (snarkjs plus artifacts) and storage (notes, keys) are injected, so the same core serves a browser app and a node signer.

### Intent builders

| Function | Resolves | Status |
| --- | --- | --- |
| `buildShieldBoundIntent(p)` | Mints a note + shield proof, then `shieldBound(...)` | Live |
| `buildShieldIntent(p)` | Plain `shield(...)`, no proof (legacy pools only) | Live |
| `buildUnshieldIntent(p)` | Witness + proof, then `unshield(...)` (cash out) | Live |
| `buildPrivateSendIntent(p)` | Transfer witness, then `transfer(...)`; returns payment + change notes | Live |
| `buildPrivateTradeIntent(p)` | Sealed-swap witness, then `sealedSwap(...)` | Disabled (pending H1) |

Each builder returns a `GloamIntent` whose `exec` is guaranteed populated. `buildPrivateTradeIntent` produces a valid intent, but the on-chain sealed-swap path is disabled pending solvency work, so it is there to wire ahead of the flip.

### Notes

```ts
makeBoundNotePoseidon(amount: bigint, asset?: Address): Promise<BoundNote>
noteCommitmentPoseidon(secret: bigint, amount: bigint, asset?: Address): Promise<bigint>
noteNullifierPoseidon(secret: bigint, commitment: bigint): Promise<bigint>
openNotePoseidon(secretHex: Hex, amount: bigint, asset: Address)
randomSecretField(): Promise<bigint>
```

### Prover (injected)

```ts
type Prover = (input: Record<string, string | string[]>) => Promise<ProveResult>
artifactProver(a: { wasm: string; zkey: string }): Prover   // paths in node, URLs in the browser
proveGroth16(input, wasm, zkey)                              // one-shot form
```

### Tree sync

```ts
syncTree(client, { pool, fromBlock?, chunkSize? }): Promise<SyncedTree>
assertTreeMatchesChain(client, pool, synced): Promise<boolean>
// SyncedTree.pathForCommitment(commitment) feeds straight into the spend builders.
```

### x402 payments

```ts
buildGloamPaymentRequirements(p): GloamPaymentRequirements   // server: the 402 challenge
buildGloamPayment(p): Promise<BuiltPayment>                  // agent: private send + X-PAYMENT header
verifyGloamPayment({ requirements, payload }): VerifyResult  // server: structural verify + on-chain checklist
buildComplianceDisclosure(p): GloamComplianceDisclosure      // optional issuer-scoped disclosure
encodeRequirements / decodeRequirements                      // 402 body transport
encodePaymentHeader / decodePaymentHeader                    // X-PAYMENT transport
GLOAM_VS_ZONE, GLOAM_X402_SCHEME                             // posture + scheme id
```

`buildGloamPayment` does not broadcast: the agent signs and broadcasts the returned `intent.exec` itself, staying self-custodial, then sets `payload.txHash`. `verifyGloamPayment` confirms the payment note binds the required amount and asset and settles through the right pool; it never assumes settlement, returning `onchainChecksRequired` for the server to confirm against the chain.

### Merkle, rates, privacy, constants

```ts
IncrementalMerkleTreePoseidon, pathToCircomInput, MERKLE_DEPTH
exactSealedAmounts, estimateSealedOut, marksToSealedRates   // sealed-rate math (pure)
publicAmountOutMin, SEALED_PRIVACY_FACTS                    // size-privacy policy
SEALED_VAULT, SHIELD_VERIFIER, NATIVE_ASSET, RH_TESTNET_CHAIN_ID, RH_MAINNET_CHAIN_ID
```

The full surface, with every parameter interface, is documented at [gloam.trade/docs/sdk/reference](https://gloam.trade/docs/sdk/reference).

![The Gloam docs](https://raw.githubusercontent.com/cryptoduke01/gloam/main/app/public/media/readme-docs.jpg)

## Framework integration

The SDK ships TypeScript source and is consumed through your bundler. It uses NodeNext `.js` import specifiers internally.

**Next.js** (App Router). Transpile the package and map the `.js` specifiers to `.ts`:

```js
// next.config.mjs
const nextConfig = {
  transpilePackages: ["@gloamtrade/sdk"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
```

**Vite / tsx / node.** Works out of the box with a bundler or a TypeScript-aware runner. `snarkjs` and `circomlibjs` have no bundled types, so if your `tsconfig` is strict, add ambient shims (`declare module "snarkjs"` and `declare module "circomlibjs"`); the [web example](https://github.com/cryptoduke01/gloam/tree/main/examples/web-shield) includes a copy you can drop in.

## Examples

Four runnable references, one for each shape a builder starts from:

| Example | Runtime | What it shows |
| --- | --- | --- |
| [agent-shield](https://github.com/cryptoduke01/gloam/tree/main/examples/agent-shield) | Node | The smallest agent: mint a note, prove, deposit privately. |
| [pay-bot](https://github.com/cryptoduke01/gloam/tree/main/examples/pay-bot) | Node | A private payment end to end: shield, sync, send. |
| [pay-x402](https://github.com/cryptoduke01/gloam/tree/main/examples/pay-x402) | Node | A private agent payment over x402: price, pay, verify. |
| [web-shield](https://github.com/cryptoduke01/gloam/tree/main/examples/web-shield) | Browser | Shield in the browser, read the balance back from chain. |

![Shield a private balance in the browser](https://raw.githubusercontent.com/cryptoduke01/gloam/main/app/public/media/readme-browser.jpg)

## Pinned public inputs

`PUBLIC_INPUTS` pins the exact signal ordering the deployed verifiers expect, so an integrator cannot drift out of proof compatibility:

```ts
PUBLIC_INPUTS.unshield   // [root, nullifier, asset, amount, to]
PUBLIC_INPUTS.transfer   // [root, nullifier, newCommitment0, newCommitment1]
PUBLIC_INPUTS.sealedSwap // [root, nullifier, newCOut, newCChange, assetIn, assetOut, amountOutMin, rateIn, rateOut]
```

## Guardrails and honesty

- **Testnet only.** Robinhood Chain testnet (chain id `46630`), with dev-ceremony proving keys. Mainnet waits for a production trusted setup and an external audit.
- **Real privacy only.** No mock successes. If a path cannot be private, the SDK returns a plan rather than a fake result.
- **Sealed swaps are disabled** pending the H1 solvency work. Shield, private send, cash out, and disclosure are live and proof-gated.
- **Note secrets are the sole spend authority.** Persist and protect them. `localStorage` is fine for a demo, not for real value.

## Links

- Documentation: [gloam.trade/docs/sdk](https://gloam.trade/docs/sdk)
- Quickstart: [gloam.trade/docs/quickstart](https://gloam.trade/docs/quickstart)
- API reference: [gloam.trade/docs/sdk/reference](https://gloam.trade/docs/sdk/reference)
- App: [gloam.trade](https://gloam.trade)
- Source: [github.com/cryptoduke01/gloam](https://github.com/cryptoduke01/gloam)
- X: [@gloamtrade](https://x.com/gloamtrade)

## License

MIT
