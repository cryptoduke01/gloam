<div align="center">

# Gloam

### The private layer for Robinhood Chain. Shielded balances, private payments, and verifiable disclosure that any app or agent can plug into.

[gloam.trade](https://gloam.trade) · [Testnet app](https://gloam.trade/app) · [Verify a disclosure](https://gloam.trade/verify) · [Docs](https://gloam.trade/docs) · [Whitepaper](https://gloam.trade/whitepaper) · [@gloamtrade](https://x.com/gloamtrade)

**Robinhood Chain** · testnet `46630` · testnet only, real ZK proofs, no mock fills

</div>

---

Robinhood Chain puts tokenized stocks and crypto on public rails: every holding, every size, every move is visible. Gloam is the sealed chamber on top of it. Shield a balance, pay privately, and later prove exactly what you choose to a counterparty or auditor, and nothing else. It is not a dark theme on a public DEX; it is a private-execution primitive that other Robinhood Chain apps and AI agents build on.

## Three surfaces, one private core

The vault app is the reference implementation, not the whole product.

| Surface | What it is | Package |
| --- | --- | --- |
| **SDK** | Drop shielded balances, private sends, and selective disclosure into any Robinhood Chain app or agent. Unsigned intents + client proving. | [`@gloam/sdk`](./packages/sdk) |
| **Agents** | An MCP server + a reference wrapper so an AI agent can shield and move value privately, under policy. | [`@gloam/mcp`](./mcp) · [`examples/agent-shield`](./examples/agent-shield) |
| **Vault** | The live testnet app that proves the whole path works. | [`app/`](./app) |

All three share one core: a Poseidon note scheme, a depth-20 incremental Merkle tree, circom witness builders, real Groth16 verification, and one canonical intent shape.

## What works today (testnet, real ZK proofs)

| Path | Status | What you can do |
| --- | --- | --- |
| **Shield** | Live, proof-gated | Deposit ETH + faucet stock tokens; the hardened pool enforces `shieldBound()` so a deposit proves `commitment == Poseidon(secret, amount, asset)` (audit C1) |
| **Private send** | Live | Send inside the vault to a receive tag; an on-chain encrypted memo inbox (`GloamPayMemo`) for discovery, with the sender no longer revealed |
| **Cash out** | Live, proof-gated | Unshield to a public balance with a real browser-generated Groth16 proof |
| **Selective disclosure** | Live | Prove you hold a specific shielded balance to a party you choose, revealing nothing else. Anyone verifies it at [`/verify`](https://gloam.trade/verify), no wallet |
| **Private trade** | Disabled, by design | `sealedSwap` is off until the H1 solvency accounting lands. Oracle-bound rates are built and tested; see below |

Every private action is proof-gated on-chain. No mock fills, no theatrical privacy. If a path cannot be both private and solvent yet, it waits. See [`contracts/audit/H1-SWAP-SOLVENCY.md`](./contracts/audit/H1-SWAP-SOLVENCY.md).

## Selective disclosure: private by default, proven by choice

The answer to the "dark pool" objection. A holder mints a disclosure for one note; the recipient verifies, entirely in the browser, that the holder owns that exact balance in the vault, without learning their identity, their note secret, or any other holding. It reuses the shield circuit (no new trusted setup): the proof binds the commitment to (amount, asset), and the verifier confirms the commitment is a live note via `pool.commitmentSeen`. Generate at `/app/disclose`, verify at `/verify`.

## Robinhood Chain native

Robinhood Chain is an **Arbitrum Orbit L2** (Nitro, mainnet live since July 2026), ETH gas, Ethereum blob DA. Gloam targets what the chain actually ships:

- **Chainlink oracles from block zero.** RH Chain prices tokenized equities on-chain via standard `AggregatorV3` feeds. Gloam's `OracleRates` module binds sealed-trade rates to the live feed with L2 sequencer-uptime, staleness, and positivity guards, and a ratio-tolerance check that is also on-chain slippage protection. Built and tested (`contracts/src/lib/OracleRates.sol`); it activates when private trade re-enables.
- **Tokenized stocks are ERC-20s** (18 decimals, ERC-8056 Total-Return value). Gloam shields the canonical set (TSLA, NVDA, AMZN, and more).
- **Groth16 runs native.** bn254 pairing precompiles are present and the 96 KB code-size cap fits large verifier contracts, so shield / unshield / transfer proofs verify with no special infra.
- **First-class ERC-4337** opens the door to gasless private transactions.

## Trust, verified

Privacy earns the mainnet gate only when it is auditable and correct.

- **Self-audited, then re-verified.** A Kensho pass found a critical funded drain, two highs, and a set of mediums in the sealed pool and client. Every critical and high is fixed and **verified on-chain and in code** (independent re-audit): the drainable pool drained and de-published, value-binding enforced at deposit (C1), the swap path disabled (H1), the re-open path closed (one-way verifier + two-step ownership). Full status: [`contracts/audit/REMEDIATION.md`](./contracts/audit/REMEDIATION.md).
- **Selective disclosure, not a mixer.** Prove balance or a payment to a counterparty or auditor without revealing everything. The right posture for a regulated-sponsor chain.
- **Honest gates.** The trusted setup is a dev ceremony and mainnet needs a multi-party one; note secrets are not yet encrypted at rest. These are disclosed, not hidden. Mainnet `4663` is blocked in-product.

## Using the SDK

Deposit privately into the hardened pool in a few lines. The SDK mints the note and generates the shield proof; you sign the resolved call.

```ts
import { buildShieldBoundIntent, artifactProver } from "@gloam/sdk";
import { parseEther } from "viem";

const intent = await buildShieldBoundIntent({
  amountWei: parseEther("0.001"),
  prover: artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" }),
});

// intent.exec is the resolved shieldBound(asset, amount, commitment, proof) call.
// Persist intent.note.secret to spend the balance later.
await wallet.writeContract({ ...intent.exec, abi: shieldPoolAbi });
```

A complete runnable agent is in [`examples/agent-shield`](./examples/agent-shield).

## Architecture

```
gloam/
  packages/sdk/          @gloam/sdk  the private path as a reusable package
  mcp/                   @gloam/mcp  agent server (plan + signed execution)
  examples/agent-shield/ reference wrapper: an agent shields via the SDK
  app/                   Next.js reference app + docs → Vercel root: app
  contracts/             Foundry · ShieldPoolPoseidon vault, verifiers, circuits, audit
```

**Contracts (RH testnet 46630)**

| Role | Address |
| --- | --- |
| Sealed vault `ShieldPoolPoseidon` (hardened, C1/C2/C3) | [`0xaEbB…1834`](https://explorer.testnet.chain.robinhood.com/address/0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834) |
| Pay memo `GloamPayMemo` | [`0x689e…5DCE`](https://explorer.testnet.chain.robinhood.com/address/0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE) |

The pre-C1 pool `0x4F38…` is drained and retired, never use it. Circuits (Groth16 + Poseidon + depth-20 Merkle membership): `shield`, `transfer`, `unshield`, `sealedSwap`. Details in [`contracts/ARCHITECTURE.md`](./contracts/ARCHITECTURE.md).

## Local

```bash
pnpm install
pnpm --filter @gloam/sdk build        # build the SDK
cd contracts && forge test            # contracts (67 tests)
pnpm --filter @gloam/sdk test         # SDK core self-tests
```

Run the reference app from `app/` (`next dev`), or open [gloam.trade/app](https://gloam.trade/app). Testnet ETH + stock tokens: [faucet.testnet.chain.robinhood.com](https://faucet.testnet.chain.robinhood.com/).

## Guardrails

- Testnet only until a production ceremony + external audit. Mainnet `4663` blocked in-product.
- Real privacy only. Never fake or mock a private success.
- Selective disclosure over opacity. Verifiable, not just hidden.
- Brand: Twilight, paper `#F4F3EF`, ink `#121316`, indigo `#3B3766`. Light, spacious, plain-language.

---

No private keys in-repo. Deploy with `DEPLOYER_PK` env only. Circuit zkeys are dev-ceremony artifacts. See [`SECURITY.md`](./SECURITY.md).
