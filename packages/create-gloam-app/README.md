# create-gloam-app

Scaffold a private app on **Robinhood Chain** in one command, powered by
[`@gloam/sdk`](https://gloam.trade/docs/sdk) — the privacy layer for RH Chain.

```bash
npm create gloam-app@latest my-private-app
# or
npx create-gloam-app my-private-app
```

Then:

```bash
cd my-private-app
npm install
npm run dev
```

Open http://localhost:3000, connect a wallet on Robinhood Chain testnet
(chain id `46630`), and shield your first private balance. Get test ETH from the
[faucet](https://faucet.testnet.chain.robinhood.com/).

## What you get

A minimal Next.js (App Router) app that shields a private balance in the browser:

- **Client-side proving** — the shield proof is generated in the browser with
  snarkjs; the circuit is fetched into `public/circuits` automatically.
- **The note never leaves the client** — its secret is the only spend authority.
- **No backend** — the private balance is read straight from the pool with
  `commitmentSeen()`.
- **Wallet signing only** — viem's injected transport signs the deposit; the app
  never touches a key.

`app/page.tsx` is the whole flow. From there, add cash out, private send, and
selective disclosure with the rest of the SDK — see the
[docs](https://gloam.trade/docs/sdk).

## Notes

Testnet only, dev-ceremony proving keys. Requires Node 18+.
