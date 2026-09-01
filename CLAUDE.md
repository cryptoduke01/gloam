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
| Paper (bg) | `#F4F3EF` |
| Ink (text) | `#121316` |
| Indigo (accent) | `#3B3766` (this is the `--lime` CSS token slot in light mode) |
| Twilight gradient | gold `#EEC996` → rose `#E4A69E` → violet `#9674B2` → indigo `#4A498C` |
| Signal green / Rust | `#2E7D53` / `#C0432F` |
| Typeface | Aeonik (self-hosted woff2), one family across the whole system |
| Chain | Robinhood Chain · mainnet `4663` · testnet `46630` |

Twilight brand ("Gloam" = dusk). Light-only. Positioning: **"The Private Layer for
Robinhood."** Voice: spacious, confident, plain-language, not technical jargon.
The `--lime` token is the indigo accent slot now — do not reintroduce acid lime or
the old Instrument Serif. Use space generously; avoid jammed, boxed layouts.

## Live on testnet (dev keys)

| Feature | Status |
| --- | --- |
| Shield / private send / cash out | Live |
| **Private trade** (`sealedSwap`) | Disable pending (audit H1: broken solvency accounting); re-enable after redesign |
| Pay memos / receive tags | Live |
| Production ceremony keys | Not yet |
| Mainnet | Blocked |

**Product vault (hardened C1/C2/C3):** `0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834` (block 110840714).  
**Drainable, never use or seed:** pre-C1 pool `0x4F38…12D8F` (audit H-P1; `emergencyWithdraw` pending — see `contracts/audit/REMEDIATION.md`).  
**Never product-default** legacy pre-sealed `0xA488…` (app remaps in `config.ts`).

## Stack

- pnpm monorepo, Node 20+
- Next.js 16 App Router + Tailwind v4 + Framer Motion
- Marketing + docs: `app/` only
- Docs live in-app at `app/src/app/docs` (the old standalone `docs/` package was removed)
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
