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

Phase 1 is **deployed** on RH testnet:

| | |
| --- | --- |
| ShieldPool | `0x2BD98196D90AB45D58843B4c8B8809aa34343d35` |
| Chain | 46630 |
| Record | [contracts/deployments/testnet.json](./contracts/deployments/testnet.json) |

App defaults to that address (`NEXT_PUBLIC_SHIELD_POOL_ADDRESS` overrides). Deposit works in `/app/shield`. Transfer / unshield stay locked until a real verifier is set.

```bash
cd contracts
forge test
# redeploy only with your own key — never commit secrets
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
- **Shield deposit:** live on RH testnet (ETH + stocks)  
- **Phase 2:** **real Poseidon unshield circuit** (note open + Merkle) proven with snarkjs; Solidity verifier in repo  
- **Live pool** still keccak Phase-1 — Poseidon pool redeploy next  
- **Next:** deploy Poseidon hashers + Poseidon ShieldPool → wire unshield UI → production ceremony  





---

Private / all rights reserved until stated otherwise.
