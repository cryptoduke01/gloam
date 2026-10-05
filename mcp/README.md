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
| `gloam_execute_private_pay` | execute | **Real private x402 settlement** from a held note: sync, prove, and broadcast `transfer()` server-side |
| `gloam_verify_payment` | server | Verify a presented x402 payment and list the on-chain settlement checks |
| `gloam_get_limits` | read | This agent's spending limits: tools, assets, per payment, per day, recipients, expiry |
| `gloam_get_spending_report` | read | Spent and left in the last 24 hours per asset, recent payments, refused attempts |

`gloam_execute_shield` is the private-execution rail: the agent ends up holding a shielded balance only it can spend. It returns the note secret, which is the only authority to spend that balance, so the agent must persist it. When no signer is configured, every execute tool returns a plan instead of acting, and we never return a fake private fill.

The x402 tools are private agent payments (the MCPay pattern, but the settlement is private). `gloam_payment_requirements` prices a resource, the agent settles a private send to the payee itself and presents an `X-PAYMENT` header, and `gloam_verify_payment` checks the payment note binds the required amount and asset before the server runs the listed on-chain checks. Unlike a Tempo Zone, no operator sees the transaction: it is private from the public and self-custodial, with an optional per-payment issuer-scoped compliance disclosure. See `TEMPO_EXPANSION.md`.

## Spending limits

An agent that can sign can spend, so every tool that moves money checks the owner's limits first: `gloam_execute_private_pay` (pay), `gloam_execute_transfer` (send) and `gloam_execute_shield` (shield). A spend that breaks a limit is refused before anything is proved or signed, with a plain reason the agent can act on, for example:

```json
{ "status": "refused", "code": "over_daily",
  "message": "That would bring the last 24 hours to 14 PathUSD, over the limit of 12 PathUSD a day. 2 PathUSD is left right now. More frees up from 2026-10-04T12:00:00.000Z." }
```

**No limits, no spending.** With a signer but no limits configured, every spend is refused. To run without limits on purpose, set `GLOAM_LIMITS=off` (spends are still logged).

### Where the limits are enforced

By this MCP server, off-chain, before it signs. The vault contract does not know about them. They bind the agent as long as its key is held only by this server; anyone who has the key directly is not bound. For a hard boundary, keep the key on the server (or in a policy wallet such as a Turnkey server wallet) and never hand it to the agent.

### What the limits cannot stop

A private balance is a note, and whoever knows a note's secret can spend it. Today the shield and pay tools hand note secrets to the agent and take them back, so the limits govern what this server signs, not where a secret goes: an agent that is tricked into pasting a note secret somewhere else has given that money away. Treat anything the agent can read as money. The fix on the roadmap is to keep note secrets inside the server and give the agent handles instead.

The same applies to x402: the payer creates the payment note, so it knows the secret too. A payee should move a received note to a fresh secret of its own before relying on it.

### What you can limit

| Limit | Meaning |
| --- | --- |
| `tools` | Which money tools the agent may use: `pay`, `send`, `shield`. Default all three |
| `assets` | Which assets it may move. Required, there is no "any" |
| `maxPerPayment` | Cap on a single payment, in the asset's units (e.g. `"5"` is 5 PathUSD) |
| `maxPerDay` | Cap over a rolling 24 hours, so a burst cannot straddle midnight |
| `recipients` | `"any"`, or a list of Gloam receive tags and `0x` addresses. Required. Shields go to the agent's own balance and skip this |
| `expiresAt` | After this the agent cannot spend. `"2026-12-31"` means through the end of that day (UTC); a full ISO timestamp is taken as written |

Assets are named by symbol (`ETH` and `USDG` on Robinhood Chain; `PathUSD`, `AlphaUSD`, `BetaUSD`, `ThetaUSD` on Tempo) or by `0x` token address with `decimals`. Matching is by network and contract address, never by the symbol a payee writes into a 402 challenge, so a payment cannot slip through by relabeling a token. Private payments must also go through Gloam's own pool on that network.

### Configure with a file (several agents)

Point `GLOAM_LIMITS_FILE` at a JSON file and pick the agent with `GLOAM_AGENT_ID` (default `default`). Each MCP server process runs as one agent. The file is read on every spend, so tightening a limit takes effect on the next call.

```json
{
  "agents": {
    "research-bot": {
      "tools": ["pay"],
      "recipients": ["gloamr1.MFkwEwYH...their-receive-tag"],
      "expiresAt": "2026-12-31",
      "assets": {
        "PathUSD": { "maxPerPayment": "5", "maxPerDay": "50" }
      }
    },
    "ops-agent": {
      "recipients": "any",
      "maxPerPayment": "250",
      "maxPerDay": "1000",
      "assets": ["USDG", "PathUSD"]
    }
  }
}
```

The array form of `assets` uses the agent-level `maxPerPayment` and `maxPerDay` for each asset; the object form sets them per asset (an asset entry may also take `network` and, for an unknown token address, `decimals`). A config that does not parse, names an unknown asset, or leaves out a cap is treated as no permission: every spend is refused with the reason.

### Configure with environment variables (one agent)

```bash
GLOAM_AGENT_ID=research-bot
GLOAM_LIMIT_ASSETS=PathUSD,USDG          # required
GLOAM_LIMIT_MAX_PER_PAYMENT=5            # required, applies to each asset
GLOAM_LIMIT_MAX_PER_DAY=50               # required, applies to each asset
GLOAM_LIMIT_RECIPIENTS=any               # required: any, or a comma list
GLOAM_LIMIT_EXPIRES=2026-12-31           # optional
GLOAM_LIMIT_TOOLS=pay,shield             # optional
```

Use the file or the variables, not both.

### The spending log

Every spend is written to a local JSON file before it is signed (`~/.gloam/spend-log.<agent>.json`, or `GLOAM_SPEND_LOG`). The check and that reservation happen under a lock, so two calls at once, or two server processes sharing the log, cannot both squeeze under the daily cap. Each entry is then settled as `sent`, `unconfirmed` (broadcast, receipt unknown), `reverted` or `failed`. Pending, sent and unconfirmed count against the limit; failed, reverted and refused do not. Refusals are logged too, so you can see what an agent tried. If the log cannot be read, the agent cannot spend.

`gloam_get_limits` shows the limits as the server sees them, and `gloam_get_spending_report` shows spent and remaining for the last 24 hours, the recent payments and the recent refusals. When there is no signer, the execute tools still return a plan, now with a `limits` preview saying whether it would be allowed.

## Setup

The SDK ships TypeScript source, so the server runs through `tsx` (no build step).

```bash
pnpm install                          # from the repo root
pnpm --filter @gloamtrade/mcp start   # runs tsx src/index.ts
```

To let the agent actually execute, give it a funded testnet signer and its limits:

```bash
GLOAM_AGENT_PRIVATE_KEY=0x<funded RH testnet key> \
GLOAM_LIMIT_ASSETS=ETH GLOAM_LIMIT_MAX_PER_PAYMENT=0.01 GLOAM_LIMIT_MAX_PER_DAY=0.05 GLOAM_LIMIT_RECIPIENTS=any \
pnpm --filter @gloamtrade/mcp start
```

Without the key the server still runs and exposes every tool; execute tools just return plans. Without limits, execute tools refuse to spend (see above). For production, swap the raw key for a Turnkey server wallet with policy (spend caps, an allow-list of contracts, size privacy always on) so the agent never holds a key and the caps also hold below this server.

Tests for the limits (no chain needed): `pnpm --filter @gloamtrade/mcp test`.

## Connect an agent

The server speaks MCP over stdio. Point any MCP client at it (Claude Desktop, Cursor, or any platform that reads MCP server configs):

```json
{
  "mcpServers": {
    "gloam": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/gloam/mcp/src/index.ts"],
      "env": {
        "GLOAM_AGENT_PRIVATE_KEY": "0x<funded testnet key>",
        "GLOAM_AGENT_ID": "research-bot",
        "GLOAM_LIMITS_FILE": "/absolute/path/to/gloam-limits.json"
      }
    }
  }
}
```

Then the agent can read markets, quote and plan private trades, and shield ETH into a private balance alongside its public Robinhood activity.

## Notes

Testnet only, dev-ceremony proving keys. The shield circuit artifacts are fetched from `https://www.gloam.trade/circuits` on first use and cached locally. Sealed-swap execution stays a plan until swaps are re-enabled. See the [SDK docs](https://gloam.trade/docs/agents).
