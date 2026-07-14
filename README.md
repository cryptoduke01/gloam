# Gloam

**Trade Everything on Robinhood Privately.**

Stocks. Memes. Same rails. Money that can sit, move, and trade without printing your book to a public chain.

---

### Live

| | |
| --- | --- |
| Site | [gloam.trade](https://gloam.trade) |
| App | [gloam.trade/app](https://gloam.trade/app) |
| Docs | [gloam.trade/docs](https://gloam.trade/docs) |
| Paper | [gloam.trade/whitepaper](https://gloam.trade/whitepaper) |
| X | [@gloamtrade](https://x.com/gloamtrade) |

---

### What this is

Gloam is private money on **Robinhood Chain** — not a dark theme on a public DEX.

**Works today (testnet):** connect, portfolio, send ETH, send faucet stock tokens, live marks, charts, **shield ETH + faucet stocks** into the live pool (history syncs from chain).

**Still closed:** private transfer, private unshield, private trade. Those need a real verifier + proofs. We do not fake them.

---

### Repo layout

```
gloam/
  app/         Marketing + product UI (Next.js) → Vercel root: app
  contracts/   ShieldPool (Foundry) — private path
  docs/        Legacy package — do not deploy
```

Public path needs **no** Gloam contracts.  
Private path needs **ShieldPool + verifier + circuits**.

---

### Local

```bash
pnpm install
pnpm dev:app          # http://localhost:3000

# contracts (Foundry)
cd contracts && forge test
```

Deploy the site with Vercel: **Root Directory = `app`**, leave Output Directory empty.

Testnet ETH: [faucet.testnet.chain.robinhood.com](https://faucet.testnet.chain.robinhood.com/)  
Chain ID **46630**.

---

### Contracts (private path)

| | Phase 1 (keccak) | Phase 2 (Poseidon) **default** |
| --- | --- | --- |
| Pool | `0x2BD9…3d35` | `0xA488…c93B` |
| Unshield | locked | live (dev keys) |
| Record | [testnet.json](./contracts/deployments/testnet.json) | [poseidon-testnet.json](./contracts/deployments/poseidon-testnet.json) |

App defaults to **Poseidon**. Override with `NEXT_PUBLIC_HASH_SCHEME=keccak` for the old pool.

```bash
cd contracts && forge test
# phase-2 redeploy: circuits/scripts/deploy-phase2.mjs
```

Details: [contracts/ARCHITECTURE.md](./contracts/ARCHITECTURE.md)

---

### Brand

Black. Lime `#C8FF00`. White. Instrument Serif + Overused Grotesk.  
No purple crypto fog.

---

### Status

- **Product:** testnet-only  
- **Phase 2 Poseidon pool:** live — shield + **prove & unshield** in the app  
- **Next:** production ceremony keys; private transfer circuit  






---

Private / all rights reserved until stated otherwise.
