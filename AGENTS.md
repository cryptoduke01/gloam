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
- Sealed vault (hardened C1/C2/C3): `0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834`. Drainable, never use or seed: `0x4F38…12D8F` (audit H-P1). Never product-default `0xA488…`

## Live on testnet (dev keys)

- Shield / private send / cash out / **private trade** (sealedSwap, size privacy default on)
- App root: `app/` · never revive `docs.gloam.trade`

## Audits

- Claude grand audit prompt: [`AUDITS/CLAUDE_GRAND_AUDIT_PROMPT.md`](./AUDITS/CLAUDE_GRAND_AUDIT_PROMPT.md)

## Rules

- Real privacy (shielded balances / private txs) — never fake or mock success.
- **Public path** needs no Gloam contracts. **Private path** needs `contracts/`.
- Product is **testnet-only** until production ceremony + audit. No mainnet mix-in.
- Brand: Twilight — paper `#F4F3EF`, ink `#121316`, indigo `#3B3766` accent, Aeonik. Light-only, spacious, plain-language. (`--lime` token = indigo slot.)
- Secrets server-side only.
- If it does not serve private trading on RH chain, it waits.
- Docs live in-app (`app/src/app/docs`). Do **not** create a separate docs project or `docs.gloam.trade`.
- Commit = commit + push to `main` for product work.
