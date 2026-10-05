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
| `gloam_execute_shield` | execute | **Real private deposit.** Mints a note, generates the Groth16 proof server-side, broadcasts `shieldBound()`, and returns a note handle |
| `gloam_execute_transfer` | execute | Public testnet transfer (funding). Amount and recipient are visible |
| `gloam_list_notes` | read | This server's notes as handles (network, asset, amount, status, creating tx) and the private balance per asset. `refresh` checks pending notes on chain |
| `gloam_receive_tag` | read | This server's receive tag (`gloamr1.…`), for others to pay it. Created on first use |
| `gloam_payment_requirements` | server | Price an agent resource in a private x402 payment; returns the 402 requirements. `payTo` defaults to this server's receive tag |
| `gloam_pay_x402` | agent | Plan the private payment that satisfies a 402 challenge |
| `gloam_execute_private_pay` | execute | **Real private x402 payment** from a note handle: sync, prove, broadcast `transfer()`, keep the change. Returns the `X-PAYMENT` header |
| `gloam_fetch_paid` | execute | Fetch a URL; on a Gloam 402, pay privately and retry with the header, all inside the server. Returns the response |
| `gloam_verify_payment` | server | Open a presented payment with this server's receive key, verify it, sweep it into a fresh note, and say whether to grant access |
| `gloam_get_limits` | read | This agent's spending limits: tools, assets, per payment, per day, recipients, expiry |
| `gloam_get_spending_report` | read | Spent and left in the last 24 hours per asset, recent payments, refused attempts |

`gloam_execute_shield` is the private-execution rail: the agent ends up with a shielded balance only this server can spend. The agent sees a note handle such as `n-k3x9p2qw7m`, never the note's secret. When no signer is configured, every execute tool returns a plan instead of acting, and we never return a fake private fill.

The x402 tools are private agent payments (the MCPay pattern, but the settlement is private). `gloam_payment_requirements` prices a resource to the payee's receive tag. The paying agent calls `gloam_execute_private_pay` (or `gloam_fetch_paid` for the whole request), which settles a private send and seals the payment note to that tag, so only the payee can open it. The payee calls `gloam_verify_payment`, which opens the note, checks it binds the required amount and asset, and sweeps it into a fresh note before saying `grantAccess: true`. Unlike a Tempo Zone, no operator sees the transaction: it is private from the public and self-custodial, with an optional per-payment issuer-scoped compliance disclosure. See `TEMPO_EXPANSION.md`.

## Notes stay in the server

A private balance is a note, and whoever knows a note's secret can spend it. So the secrets never go to the agent. They live in an encrypted file inside this server, and the tools hand out handles plus facts that are not secret: network, asset, amount, status (`unspent`, `pending`, `spent`) and the transaction that created the note.

- `gloam_execute_shield` stores the minted note before anything is broadcast, then marks it unspent once the deposit confirms. If the deposit never goes out, the note is dropped.
- `gloam_execute_private_pay` takes a handle (or picks the smallest note that covers the price), reserves it so no other call can spend it at the same time, and stores the change as a new note. On success the input is marked spent. If nothing was broadcast, the input is spendable again. If a transaction went out but its result is unknown, both stay pending until `gloam_list_notes` with `refresh` settles them.
- A payment spends one note. Notes are not combined, so a balance split across small notes may not cover one large payment.

| Setting | Meaning |
| --- | --- |
| `GLOAM_NOTE_KEY` | 32 random bytes in hex (`openssl rand -hex 32`). The store key. Recommended, and required for a server with no signer |
| (unset) | The store key is derived from `GLOAM_AGENT_PRIVATE_KEY` with HKDF-SHA256 under a Gloam note-store label, so it is never the signing key itself |
| `GLOAM_NOTE_STORE` | Where the store lives. Default `~/.gloam/notes.<agent>.json` |
| `GLOAM_EXPOSE_NOTE_SECRETS=1` | **Unsafe, legacy only.** Brings back the old behavior: shield and pay return note secrets, pay accepts `noteSecret`, and a `payTo` that is not a receive tag is paid with an unsealed note. Off by default. Read once at startup |

The store is AES-256-GCM over the whole file (amounts and counts are hidden too), bound to the agent id, written with mode `0600` under the same kind of lock as the spending log. A store that does not decrypt is never overwritten, since it holds the only copy of the money: fix the key or move the file. Back it up together with its key. Changing `GLOAM_NOTE_KEY`, or the signer when the key is derived, makes an existing store unreadable until the old key is back.

## Getting paid: sweep before you serve

In x402 the payer builds the payment note, so the payer knows its secret too. If a server served right after checking the payment, the payer could spend the note back before the server moved it. `gloam_verify_payment` closes that gap:

1. It opens the sealed note with this server's receive key (a note sealed to anyone else does not open).
2. It checks the note binds the required amount and asset, is the payment output of the presented transfer, and sits in Gloam's pool on that network (requirements naming any other pool are refused).
3. It sweeps the note: a private transfer of the whole amount into a fresh note only this server knows. The fresh note is stored before the sweep is sent.
4. Only when the sweep confirms does it return `grantAccess: true`. If the payer already spent the note, the sweep cannot land and the answer is `already_spent`. The same header presented twice gets `already_settled`.

The sweep is signed by `GLOAM_AGENT_PRIVATE_KEY`, or sent through the Gloam relay with `GLOAM_USE_RELAY=1` (or `GLOAM_RELAY_URL`), so a payee needs no gas and its wallet never appears. With neither, the answer is `verified_not_final` and `grantAccess: false`. The sweep is not a spend under the limits: it can only move money this server just received into a note this server holds.

## Spending limits

An agent that can sign can spend, so every tool that moves money checks the owner's limits first: `gloam_execute_private_pay` and `gloam_fetch_paid` (pay), `gloam_execute_transfer` (send) and `gloam_execute_shield` (shield). A spend that breaks a limit is refused before anything is proved or signed, with a plain reason the agent can act on, for example:

```json
{ "status": "refused", "code": "over_daily",
  "message": "That would bring the last 24 hours to 14 PathUSD, over the limit of 12 PathUSD a day. 2 PathUSD is left right now. More frees up from 2026-10-04T12:00:00.000Z." }
```

**No limits, no spending.** With a signer but no limits configured, every spend is refused. To run without limits on purpose, set `GLOAM_LIMITS=off` (spends are still logged).

### Where the limits are enforced

By this MCP server, off-chain, before it signs. The vault contract does not know about them. They bind the agent as long as its key is held only by this server; anyone who has the key directly is not bound. For a hard boundary, keep the key on the server (or in a policy wallet such as a Turnkey server wallet) and never hand it to the agent.

### What is protected, and what is not

Protected now:

- **The agent never holds a secret.** Note secrets stay in the server's encrypted store; the agent works with handles. A prompt-injected agent cannot paste a secret it never saw. Tests check that no tool result carries a note secret or a receive key.
- **Payments are sealed to the payee.** The payment note in the `X-PAYMENT` header is encrypted to the payee's receive tag, so the agent, a proxy or a log that sees the header cannot open it. A `payTo` that is not a receive tag is refused.
- **A payer cannot take a payment back.** `gloam_verify_payment` sweeps every payment into a fresh note before it grants access, and refuses when the note was already spent.
- **Limits still gate every spend** before anything is proved or signed, exactly as before.

Not protected:

- **Spending inside the limits.** A tricked agent can still pay an allowed recipient up to its caps. Keep `recipients` narrow and the caps small.
- **The host.** Whoever can read the store and its key (`GLOAM_NOTE_KEY`, or the signer key it is derived from) controls the notes. Treat the store and the key as money, keep the key out of the agent's reach, and back both up.
- **The resources it fetches.** `gloam_fetch_paid` returns the response body to the agent, and that body can carry its own prompt injection. The server will not fetch loopback, private, link-local or cloud-metadata addresses, including through a redirect (`GLOAM_FETCH_ALLOW_PRIVATE=1` lifts this for local testing); a host that changes its DNS answer between the check and the request is not fully covered.
- **A payment whose retry fails.** The header is returned so the agent can present it again with `gloam_fetch_paid` (`paymentHeader`) without paying twice. The payer keeps no copy of the payment note's secret, so a payment the payee never redeems cannot be pulled back.
- **Payers on older versions** may still send an unsealed note. The payee sweeps it the same way, but anyone who saw that header could race the sweep, in which case the payee refuses and the payer has lost it.
- **Legacy mode.** With `GLOAM_EXPOSE_NOTE_SECRETS=1` none of the first two points hold.

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

To let the agent actually execute, give it a funded testnet signer, a note-store key and its limits:

```bash
GLOAM_AGENT_PRIVATE_KEY=0x<funded RH testnet key> \
GLOAM_NOTE_KEY=$(openssl rand -hex 32) \
GLOAM_LIMIT_ASSETS=ETH GLOAM_LIMIT_MAX_PER_PAYMENT=0.01 GLOAM_LIMIT_MAX_PER_DAY=0.05 GLOAM_LIMIT_RECIPIENTS=any \
pnpm --filter @gloamtrade/mcp start
```

Keep the note key somewhere durable (not a fresh `openssl` each start): the store cannot be opened without it. Without the signer the server still runs and exposes every tool; execute tools just return plans. Without limits, execute tools refuse to spend (see above). For production, swap the raw key for a Turnkey server wallet with policy (spend caps, an allow-list of contracts, size privacy always on) so the agent never holds a key and the caps also hold below this server.

Tests (no chain needed): `pnpm --filter @gloamtrade/mcp test` runs the spending limits and the note custody tests (store encryption and locking, shield to pay to sweep over a mock pool, the fetch round trip, the legacy flag, and a scan that no tool result carries a secret).

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
        "GLOAM_NOTE_KEY": "<64 hex characters, kept somewhere safe>",
        "GLOAM_AGENT_ID": "research-bot",
        "GLOAM_LIMITS_FILE": "/absolute/path/to/gloam-limits.json"
      }
    }
  }
}
```

Then the agent can read markets, quote and plan private trades, shield into a private balance, and pay for x402 resources privately, alongside its public Robinhood activity.

## Testnet

Testnet only, dev-ceremony proving keys. The shield and transfer circuit artifacts are fetched from `https://www.gloam.trade/circuits` on first use and cached locally. Sealed-swap execution stays a plan until swaps are re-enabled. See the [SDK docs](https://gloam.trade/docs/agents).
