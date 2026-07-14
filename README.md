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

**Works today (testnet):**

| Path | What you can do |
| --- | --- |
| Public | Connect, portfolio, send ETH, send faucet stocks, markets, charts |
| Vault in | **Shield** ETH + faucet stocks into the live Poseidon pool |
| Vault move | **Private send** — pay someone inside the vault (payment code + optional passphrase) |
| Vault out | **Cash out** (unshield) with a real browser proof |
| Vault trade | **Adapter:** cash out → public DEX swap → re-shield (swap edge still public) |
| Note backup | Settings → export/import vault note secrets (this browser / JSON) |

**Not yet:** sealed-size private trade (size stays hidden). Production ceremony keys for real money.

---

### Repo layout

```
gloam/
  app/         Marketing + product UI (Next.js) → Vercel root: app
  contracts/   ShieldPool (Foundry) — private path
  docs/        Legacy package — do not deploy
```

Public path needs **no** Gloam contracts.  
Private path needs **ShieldPool + dual verifier + circuits**.

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
| Unshield / transfer | locked | live (dev keys) |
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
- **Poseidon pool:** shield · private send · cash out · vault trade adapter  
- **Next:** sealed-size private trade · production ceremony keys  

---

Private / all rights reserved until stated otherwise.
