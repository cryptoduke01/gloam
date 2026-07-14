# Shield architecture (v0)

## Goal

**Trade Everything on Robinhood Privately** — private hold / move / trade on **testnet first**.

## Contract surface

```
User wallet
    │
    ├─ public path ──► ETH / ERC-20 (no Gloam contracts)
    │
    └─ private path ─► ShieldPool ──► IVerifier
                           │
                           ├ commitments[]  (notes)
                           ├ spent nullifiers
                           └ currentRoot
```

### Phases

| Phase | What ships | Custody |
| --- | --- | --- |
| **0 (now)** | Interfaces + `ShieldPool` scaffold + unit tests | Commitments only; **no real asset custody** |
| **1** | ERC-20/ETH pull on `shield`, Merkle tree, client note encryption | Pool holds assets |
| **2** | Real verifier + circuits (transfer / unshield) | Full private move |
| **3** | Private trade adapter | Intent hidden until exit |

## Why not invent circuits on day one

Prefer battle-tested EVM privacy patterns (Railgun-class ideas: commitments, nullifiers, Merkle roots, ZK proofs). Scaffold matches that shape so we can plug a real verifier without rewriting the app model.

## App integration (later)

```
app/src/lib/shield.ts     → ABIs + addresses from deployments/testnet.json
app/.../ShieldView.tsx    → call shield() only when Verifier set + audits ok
```

Until then UI stays: **“Not live”**.

## Threat model (short)

- **Hidden (goal):** amount, private graph, trade size while shielded  
- **Visible:** shield/unshield edges, contract calls, proof verification  
- **Out of scope as magic:** malware, coerced keys, tiny anonymity set  

## Testnet policy

- Chain ID **46630** only for Gloam private deploys until private path works  
- No mainnet deploys of ShieldPool until audits + real verifier  
