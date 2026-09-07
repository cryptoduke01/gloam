# @gloamtrade/mcp

Private execution tools for AI agents on Robinhood Chain, powered by [`@gloamtrade/sdk`](../packages/sdk).

Robinhood gives agents an MCP server for **public** trading. Gloam gives them one for **private** execution. An agent connects both: Robinhood for open trades, Gloam so its size and strategy stay off the public chain.

## Tools

| Tool | Type | What it does |
| --- | --- | --- |
| `gloam_info` | read | What Gloam is and what the agent can do |
| `gloam_privacy_status` | read | Honest posture: what is public, what is private, how thin the anonymity set is |
| `gloam_list_markets` | read | Markets an agent can trade privately, with indicative marks |
| `gloam_quote` | read | Indicative quote plus what stays private |
| `gloam_plan_private_trade` | plan | Describe a private trade before executing (no signing) |
| `gloam_plan_shield` | plan | Describe a shield before executing (no signing) |
| `gloam_execute_shield` | execute | **Real private deposit.** Mints a note, generates the Groth16 proof server-side, and broadcasts `shieldBound()` |
| `gloam_execute_transfer` | execute | Public testnet transfer (funding). Amount and recipient are visible |
| `gloam_payment_requirements` | server | Price an agent resource in a private x402 payment; returns the 402 requirements |
| `gloam_pay_x402` | agent | Plan the self-custodial private payment that satisfies a 402 challenge |
| `gloam_verify_payment` | server | Verify a presented x402 payment and list the on-chain settlement checks |

`gloam_execute_shield` is the private-execution rail: the agent ends up holding a shielded balance only it can spend. It returns the note secret, which is the only authority to spend that balance, so the agent must persist it. When no signer is configured, every execute tool returns a plan instead of acting, and we never return a fake private fill.

The x402 tools are private agent payments (the MCPay pattern, but the settlement is private). `gloam_payment_requirements` prices a resource, the agent settles a private send to the payee itself and presents an `X-PAYMENT` header, and `gloam_verify_payment` checks the payment note binds the required amount and asset before the server runs the listed on-chain checks. Unlike a Tempo Zone, no operator sees the transaction: it is private from the public and self-custodial, with an optional per-payment issuer-scoped compliance disclosure. See `TEMPO_EXPANSION.md`.

## Setup

The SDK ships TypeScript source, so the server runs through `tsx` (no build step).

```bash
pnpm install                          # from the repo root
pnpm --filter @gloamtrade/mcp start   # runs tsx src/index.ts
```

To let the agent actually execute, give it a funded testnet signer:

```bash
GLOAM_AGENT_PRIVATE_KEY=0x<funded RH testnet key> pnpm --filter @gloamtrade/mcp start
```

Without that variable the server still runs and exposes every tool; execute tools just return plans. For production, swap the raw key for a Turnkey server wallet with policy (spend caps, an allow-list of contracts, size privacy always on) so the agent never holds a key and cannot act out of policy.

## Connect an agent

The server speaks MCP over stdio. Point any MCP client at it (Claude Desktop, Cursor, or any platform that reads MCP server configs):

```json
{
  "mcpServers": {
    "gloam": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/gloam/mcp/src/index.ts"],
      "env": { "GLOAM_AGENT_PRIVATE_KEY": "0x<funded testnet key>" }
    }
  }
}
```

Then the agent can read markets, quote and plan private trades, and shield ETH into a private balance alongside its public Robinhood activity.

## Notes

Testnet only, dev-ceremony proving keys. The shield circuit artifacts are fetched from `https://www.gloam.trade/circuits` on first use and cached locally. Sealed-swap execution stays a plan until swaps are re-enabled. See the [SDK docs](https://gloam.trade/docs/agents).
