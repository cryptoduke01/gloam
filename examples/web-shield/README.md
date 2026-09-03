# gloam-web-shield

Shield a **private balance in the browser** with [`@gloamtrade/sdk`](../../packages/sdk).
The smallest complete web integration: connect an injected wallet, prove the
shield client-side, deposit via `shieldBound()`, and read the private balance
straight back from the pool.

A minimal Next.js (App Router) app — copy the pattern into your own dapp.

## What it shows

- **Client-side proving.** `artifactProver` points snarkjs at the shield circuit
  over HTTP; the proof is generated in the browser.
- **The note never leaves the client.** `buildShieldBoundIntent` mints the note;
  its secret is stored in `localStorage` keyed by commitment. It is the only
  spend authority.
- **No backend.** The private balance is read directly from the pool with
  `commitmentSeen()` — no indexer, no server.
- **Wallet signing only.** viem's `custom(window.ethereum)` transport signs the
  deposit; the app never touches a private key.

## Run

```bash
pnpm install            # from the repo root (workspace)
cd examples/web-shield
npm run dev             # copies the shield artifacts, then starts Next
```

Open http://localhost:3000, connect a wallet on Robinhood Chain testnet
(chain id `46630`), and shield. Get test ETH from the
[faucet](https://faucet.testnet.chain.robinhood.com/).

### Circuit artifacts

The shield circuit's `shield.wasm` and `shield_final.zkey` are served from
`public/circuits/`. `npm run dev` / `npm run build` copy them from
`app/public/circuits` automatically (`npm run artifacts`). To point at a hosted
copy instead, set `NEXT_PUBLIC_GLOAM_ARTIFACTS` (it must serve CORS):

```bash
NEXT_PUBLIC_GLOAM_ARTIFACTS=https://your-cdn/circuits npm run dev
```

## What stays private

Shielding is a public deposit — the amount you deposit is visible. What is
hidden is **who can spend it**: the note commitment reveals nothing, so later
private sends and cash-outs are unlinkable to this deposit. See
[`examples/pay-bot`](../pay-bot) for the private-send path and the
[SDK docs](https://gloam.trade/docs/sdk) for the full surface.

## Notes

- Testnet only, dev-ceremony proving keys.
- `localStorage` is per-browser; a real app should back up note secrets.
