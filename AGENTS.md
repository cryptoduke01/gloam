# Gloam

**Thesis: Trade Everything on Robinhood Privately.**

Stocks. Memes. Shielded balances, private transfers, private trade on Robinhood Chain.

## Canonical

- Domain: `gloam.trade` (single host)
- Docs: `gloam.trade/docs`
- Whitepaper: `gloam.trade/whitepaper`
- Testnet product: `gloam.trade/app` (future host: `testnet.gloam.trade`)
- X: `@gloamtrade`
- Vercel: one project, Root Directory = `app`
- Contracts: `contracts/` (Foundry) — ShieldPoolPoseidon sealed vault; RH testnet only
- Sealed vault: `0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F` (never product-default `0xA488…`)

## Live on testnet (dev keys)

- Shield / private send / cash out / **private trade** (sealedSwap, size privacy default on)
- App root: `app/` · never revive `docs.gloam.trade`

## Audits

- Claude grand audit prompt: [`AUDITS/CLAUDE_GRAND_AUDIT_PROMPT.md`](./AUDITS/CLAUDE_GRAND_AUDIT_PROMPT.md)

## Rules

- Real privacy (shielded balances / private txs) — never fake or mock success.
- **Public path** needs no Gloam contracts. **Private path** needs `contracts/`.
- Product is **testnet-only** until production ceremony + audit. No mainnet mix-in.
- Brand: black `#000000`, lime `#C8FF00`, white. No purple crypto slop.
- Secrets server-side only.
- If it does not serve private trading on RH chain, it waits.
- Do **not** deploy `docs/` as a separate project or `docs.gloam.trade`.
- Commit = commit + push to `main` for product work.
