# Shield architecture (v2 — Poseidon live)

## Goal

**Trade Everything on Robinhood Privately** — private hold / move / trade on **Robinhood Chain testnet**.

## Contract surface

```
User wallet
    │
    ├─ public path ──► ETH / ERC-20 / DEX (no Gloam contracts)
    │
    └─ private path ─► ShieldPoolPoseidon ──► DualProofVerifier
                           │                      ├ UnshieldIVerifier (5 inputs)
                           │                      └ TransferIVerifier (4 inputs)
                           ├ commitments (Poseidon Merkle leaves)
                           ├ spent nullifiers
                           └ currentRoot
```

## Live deploy (RH testnet 46630)

See [deployments/poseidon-testnet.json](./deployments/poseidon-testnet.json).

| | |
| --- | --- |
| Pool | `0xA488…c93B` |
| DualProofVerifier | `0x4B0D…949C` |
| Hash | Poseidon |
| Proof layout | v2 |
| Keys | **Dev ceremony** — not production |

Legacy keccak Phase-1 pool `0x2BD9…` remains on-chain but is not the product default.

## Phases (status)

| Phase | What | Status |
| --- | --- | --- |
| 0 | Interfaces + scaffold | Done |
| 1 | Keccak pool, shield only | Live (legacy) |
| 2 | Poseidon pool, unshield + transfer, dual verifier | **Live (dev keys)** |
| 3a | Vault trade adapter (unshield → DEX → reshield) | **App live** |
| 3b | Sealed-size private trade | Design only — [SEALED_TRADE.md](./SEALED_TRADE.md) |
| Prod | Ceremony keys + audit + mainnet | Blocked — [PRODUCTION.md](./PRODUCTION.md) |

## Note scheme (Poseidon)

```
commitment = Poseidon(secret, amount, asset)
nullifier  = Poseidon(secret, commitment)
Merkle     = Poseidon(left, right)  // depth 20
```

| Piece | Location |
| --- | --- |
| Unshield circuit | `circuits/unshield/` |
| Transfer circuit | `circuits/transfer/` |
| Dual verifier | `src/verifiers/DualProofVerifier.sol` |
| Pool | `src/ShieldPoolPoseidon.sol` |
| App artifacts | `app/public/circuits/*.wasm` + `*_final.zkey` |

### Proof public inputs (v2)

**Unshield (5):** `[root, nullifier, asset, amount, to]`  
**Transfer (4):** `[root, nullifier, newC0, newC1]`  
`newC0` = payment note, `newC1` = change note.

## App integration

```
app/src/lib/config.ts          → Poseidon pool default
app/src/lib/shield.ts          → ABI, local notes
app/src/lib/treeSync.ts        → rebuild tree from Shielded + Transferred
app/src/lib/proveClient.ts     → browser snarkjs
app/.../ShieldView.tsx         → deposit
app/.../MoveView.tsx           → private send + cash out
app/.../VaultTradePanel.tsx    → vault trade adapter
```

## Threat model (short)

- **Hidden (goal):** amount while shielded; private-send parties/amount (anonymity set dependent)
- **Visible:** shield / cash-out / vault-trade swap edges; contract usage; timing
- **Never:** mock verifier on a funded pool; fake “private success” UI
- **Keys:** current zkeys are **dev** — do not use for real money

## Testnet policy

- Chain ID **46630** only for Gloam private deploys until production criteria  
- No mainnet ShieldPool until audits + production ceremony (or equivalent)
