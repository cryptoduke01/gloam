# Gloam

**Trade Everything on Robinhood Privately.**

Stocks. Memes. Shielded balances, private transfers, private trade on Robinhood Chain.

| | |
| --- | --- |
| Site | [gloam.trade](https://gloam.trade) |
| Docs | [docs.gloam.trade](https://docs.gloam.trade) |
| X | [@gloamtrade](https://x.com/gloamtrade) |

## What this is

Private trading rails on **Robinhood Chain** (EVM L2):

- Stocks + memes on the same private layer
- Shielded balances, private transfers, private trade
- Real privacy — not a dark theme on a public DEX

## Monorepo

```
gloam/
  app/    → gloam.trade        (marketing / landing)
  docs/   → docs.gloam.trade   (documentation + whitepaper)
```

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
