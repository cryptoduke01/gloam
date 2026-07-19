# Gloam — Claude handoff

You are taking over **Gloam**: private trading on **Robinhood Chain**.

## Thesis (canonical)

**Trade Everything on Robinhood Privately.**

- Stocks + memes on the same rails
- Shielded balances, private transfers, private trade
- Real privacy — never mock fills or theatrical privacy
- Domain: `gloam.trade` only
- Docs: `/docs` · Whitepaper: `/whitepaper`
- X: `@gloamtrade`
- Repo: `github.com/cryptoduke01/gloam`
- **One Vercel project**, Root Directory `app`. No `docs.gloam.trade`.

## Brand

| Token | Value |
| --- | --- |
| Black | `#000000` |
| Lime | `#C8FF00` (dark) / darker lime in light mode |
| Display | Instrument Serif |
| Body | Overused Grotesk |
| Chain | Robinhood Chain · mainnet `4663` · testnet `46630` |

No purple crypto slop. Voice: dense, theoretical, premium.

## Live on testnet (dev keys)

| Feature | Status |
| --- | --- |
| Shield / private send / cash out | Live |
| **Private trade** (`sealedSwap`) | Live — size privacy default on (`amountOutMin = 1`) |
| Pay memos / receive tags | Live |
| Production ceremony keys | Not yet |
| Mainnet | Blocked |

**Product vault:** `0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F`  
**Never product-default** legacy pre-sealed `0xA488…` (app remaps in `config.ts`, clean Vercel env is better).

## Stack

- pnpm monorepo, Node 20+
- Next.js 16 App Router + Tailwind v4 + Framer Motion
- Marketing + docs: `app/` only
- `docs/` package is **legacy — do not deploy**
- App build: `next build --webpack`
- Contracts: Foundry · `evm_version = shanghai`
- OG: system fonts only, under Edge 1MB

## Key files

```
app/src/lib/config.ts              # sealed vault default + A488 remap
app/src/lib/privacy.ts             # size privacy (amountOutMin floor)
app/src/lib/sealedRates.ts         # mark rates + exact amounts
app/src/lib/rhClient.ts            # RH RPC (not wallet) for reads
app/src/components/app/SealedTradePanel.tsx
app/src/components/app/MoveView.tsx
app/src/components/Landing.tsx
app/src/components/DocsLayout.tsx
app/src/app/docs/**
app/src/app/whitepaper/page.tsx
contracts/src/ShieldPoolPoseidon.sol
contracts/ARCHITECTURE.md
AGENTS.md DEPLOY.md
```

## Your job

- QA + fix: empty voids, light/dark, mobile, a11y, motion stuck opacity, docs honesty vs live rails
- Builds: `pnpm build:app` must pass
- Ship small commits to **main** (commit = commit + push for product work)
- Prefer private-trade moat work over generic chrome

### Do not

- Revive `docs.gloam.trade` or a second Vercel project for docs
- Fake privacy features / mock private success
- Hardcode `text-white` on brand text that must work in light mode
- Point product at `0xA488…` or mix mainnet with testnet private rails
