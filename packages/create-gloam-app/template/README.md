# {{PROJECT_NAME}}

A private app on **Robinhood Chain**, scaffolded with
[`create-gloam-app`](https://www.npmjs.com/package/create-gloam-app) and powered
by [`@gloamtrade/sdk`](https://gloam.trade/docs/sdk).

It shields a private balance in the browser: connect a wallet, prove the shield
client-side, deposit via `shieldBound()`, and read the balance back from the pool
with `commitmentSeen()`. The note secret is stored in `localStorage` and never
leaves the client.

## Run

```bash
npm install
npm run dev
```

`npm run dev` fetches the shield circuit into `public/circuits`, then starts on
http://localhost:3000. Connect a wallet on Robinhood Chain testnet (chain id
`46630`) and shield. Get test ETH from the
[faucet](https://faucet.testnet.chain.robinhood.com/).

## Where to go next

- `app/page.tsx` is the whole flow — `buildShieldBoundIntent`, wallet signing,
  and the balance read. Start there.
- Add **cash out** and **private send** with `buildUnshieldIntent` /
  `buildPrivateSendIntent` + `syncTree` — see the
  [SDK reference](https://gloam.trade/docs/sdk/reference).
- Add **selective disclosure** to prove a balance to a chosen party — see the
  [disclosure guide](https://gloam.trade/docs/sdk/disclosure).

## Notes

- Testnet only, dev-ceremony proving keys.
- The note secret is the only spend authority. `localStorage` is per-browser; a
  real app should back it up.
- Artifacts are fetched from `https://www.gloam.trade/circuits` by default. Point
  `GLOAM_ARTIFACTS_SOURCE` (build-time download) or `NEXT_PUBLIC_GLOAM_ARTIFACTS`
  (browser fetch, needs CORS) elsewhere to self-host them.
