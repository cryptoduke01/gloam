# Gloam

**Trade Everything on Robinhood Privately.**

Stocks. Memes. Shielded balances, private transfers, private trade on Robinhood Chain.

| | |
| --- | --- |
| Site | [gloam.trade](https://gloam.trade) |
| Docs | [gloam.trade/docs](https://gloam.trade/docs) |
| Whitepaper | [gloam.trade/whitepaper](https://gloam.trade/whitepaper) |
| X | [@gloamtrade](https://x.com/gloamtrade) |

## What this is

Private trading rails on **Robinhood Chain** (EVM L2):

- Stocks + memes on the same private layer
- Shielded balances, private transfers, private trade
- Real privacy — not a dark theme on a public DEX

## Monorepo

```
gloam/
  app/        → gloam.trade (landing + product /app + /docs pages)
  docs/       → legacy package (do not deploy)
  contracts/  → Foundry — ShieldPool scaffold (private path)
```

**Smart contracts are only required for privacy** (shield / private move / private trade).  
Public send and faucet stock transfers need no Gloam contracts.

## Contracts

```bash
# requires Foundry: https://book.getfoundry.sh/getting-started/installation
cd contracts && forge install && forge test
```

See [contracts/ARCHITECTURE.md](./contracts/ARCHITECTURE.md).

## Setup

```bash
pnpm install
pnpm dev:app    # http://localhost:3000
pnpm build:app
```

## Deploy

One Vercel project. Root Directory = **`app`**. Output Directory empty. See [DEPLOY.md](./DEPLOY.md).

## Stack (target)

- Next.js + TypeScript + Tailwind
- Robinhood Chain (`chainId` 4663)
- viem / wagmi
- Privacy: EVM shielded-pool path (integrate/port — not mocked)

## License

Private / all rights reserved until stated otherwise.
