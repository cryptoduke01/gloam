# Gloam

**Trade and move money privately onchain — on Robinhood Chain.**

| | |
| --- | --- |
| Site | [gloam.trade](https://gloam.trade) |
| App | [app.gloam.trade](https://app.gloam.trade) |
| Docs | [docs.gloam.trade](https://docs.gloam.trade) |
| X | [@gloamtrade](https://x.com/gloamtrade) |

## What this is

Private money rails on **Robinhood Chain** (EVM L2):

- Shielded balances
- Private transfers
- Private trading (stock tokens first, then liquid assets)
- Trench-simple product UX

Not a dark theme on a public DEX. Real privacy, stacked as the chain matures.

## Monorepo

```
gloam/
  app/    → app.gloam.trade   (product)
  docs/   → docs.gloam.trade  (documentation)
```

Root marketing domain `gloam.trade` can point at `app` or a thin landing later.

## Setup

```bash
pnpm install
pnpm dev:app    # http://localhost:3000
pnpm dev:docs   # http://localhost:3001
```

## Domains / DNS (later)

| Host | Target |
| --- | --- |
| `gloam.trade` | Landing or redirect → app |
| `app.gloam.trade` | Vercel project: `app` |
| `docs.gloam.trade` | Vercel project: `docs` |

At your registrar (or Cloudflare): CNAME each host to Vercel, then assign domains in the Vercel project settings. See [DEPLOY.md](./DEPLOY.md).

## Stack (target)

- Next.js + TypeScript + Tailwind
- Robinhood Chain (`chainId` 4663)
- viem / wagmi
- Privacy: EVM shielded-pool path (integrate/port — not mocked)

## License

Private / all rights reserved until stated otherwise.
