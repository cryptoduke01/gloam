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

**Works today (testnet):** connect, portfolio, send ETH, send faucet stock tokens, live marks, charts.

**Still closed:** shield, private transfer, private trade. Those need contracts and proofs. We do not fake them.

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

Phase 1 is in source: custody, Merkle tree, unshield payout path. Transfer / unshield stay locked until a real verifier is set.

```bash
cd contracts
forge test
# deploy only with your own key — never commit secrets
export DEPLOYER_PK=0x...
forge script script/DeployShieldPool.s.sol \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --broadcast
```

Details: [contracts/ARCHITECTURE.md](./contracts/ARCHITECTURE.md)

---

### Brand

Black. Lime `#C8FF00`. White. Instrument Serif + Overused Grotesk.  
No purple crypto fog.

---

### Status

- **Product:** testnet-only until the private rails hold  
- **Frontend / public flows:** largely shipped  
- **Next:** deploy ShieldPool → real verifier → wire Shield UI  

---

Private / all rights reserved until stated otherwise.
