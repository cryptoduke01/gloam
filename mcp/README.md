# Gloam MCP server

Private-trading tools for AI agents on Robinhood Chain.

Robinhood gives agents an MCP server for **public** trading. Gloam gives them one
for **private** trading. An agent connects both: Robinhood for open execution,
Gloam so its size and strategy stay off the public chain.

## Tools (v0)

| Tool | Type | What it does |
| --- | --- | --- |
| `gloam_info` | read | What Gloam is and what the agent can do |
| `gloam_privacy_status` | read | Honest privacy posture (what is live, how strong the anonymity set is) |
| `gloam_list_markets` | read | Markets an agent can trade privately, with marks |
| `gloam_quote` | read | Indicative quote plus what stays private |
| `gloam_plan_private_trade` | plan | Builds a private-trade intent to sign |
| `gloam_plan_shield` | plan | Builds a shield (deposit-to-private) intent |

The `plan_*` tools return an intent object, they do not sign or broadcast. Signed
execution requires a connected agent wallet (e.g. a Turnkey embedded wallet with
policy guardrails) and lands next. We never return a fake private fill.

## Run

```bash
pnpm --filter @gloamtrade/mcp build
pnpm --filter @gloamtrade/mcp start
```

Or during development:

```bash
pnpm --filter @gloamtrade/mcp dev
```

## Connect an agent

The server speaks MCP over stdio. Point any MCP client at it. Example config
(Claude Desktop, Cursor, or any agent platform that reads MCP server configs):

```json
{
  "mcpServers": {
    "gloam": {
      "command": "node",
      "args": ["/absolute/path/to/gloam/mcp/dist/index.js"]
    }
  }
}
```

Then the agent can call `gloam_list_markets`, `gloam_quote`, and plan private
trades alongside its public Robinhood trades.
