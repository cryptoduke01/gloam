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
| Chain | Robinhood Chain · mainnet `4663` |

No purple crypto slop. Voice: dense, theoretical, premium.

## Stack

- pnpm monorepo, Node 20+
- Next.js 16 App Router + Tailwind v4 + Framer Motion
- Marketing + docs: `app/` only
- `docs/` package is **legacy — do not deploy**
- App build: `next build --webpack`
- OG: system fonts only, under Edge 1MB

## Key files

```
app/src/components/Landing.tsx
app/src/components/DocsLayout.tsx     # Arrow-inspired docs shell
app/src/components/HeroPrivacyArt.tsx
app/src/components/EncryptFlow.tsx
app/src/components/Logo.tsx           # text-foreground (light-mode safe)
app/src/app/docs/**                   # docs routes
app/src/app/whitepaper/page.tsx
app/src/app/globals.css
AGENTS.md DEPLOY.md
```

## Your job

QA + fix: empty voids, light/dark, mobile, a11y, motion stuck opacity, docs polish.
Builds: `pnpm build:app` must pass. Ship small commits to main.

### Do not

- Revive `docs.gloam.trade` or a second Vercel project for docs
- Fake privacy features
- Hardcode `text-white` on brand text that must work in light mode
