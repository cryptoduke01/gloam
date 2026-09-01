# Shield architecture (v2 — Poseidon sealed vault live)

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
                           ├ sealedSwap ─────────► SealedSwapIVerifier (9 inputs)
                           ├ commitments (Poseidon Merkle leaves)
                           ├ spent nullifiers
                           └ currentRoot
```

## Live deploy (RH testnet 46630)

See [deployments/poseidon-testnet.json](./deployments/poseidon-testnet.json).

| | |
| --- | --- |
| Pool (product) | `0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834` |
| Deploy block | `90436718` |
| SealedSwapVerifier | `0xE19a…dF8D` / IVerifier `0x68C2…2371` |
| DualProofVerifier | `0x4B0D…949C` |
| GloamPayMemo | `0x689e…5DCE` |
| Hash | Poseidon |
| Proof layout | v2 |
| Keys | **Dev ceremony** — not production |

Legacy Poseidon (pre-sealed) `0xA488…` and keccak `0x2BD9…` remain on-chain for history only. **App must not default to them.**

## Phases (status)

| Phase | What | Status |
| --- | --- | --- |
| 0 | Interfaces + scaffold | Done |
| 1 | Keccak pool, shield only | Live (legacy) |
| 2 | Poseidon pool, unshield + transfer, dual verifier | **Live (dev keys)** |
| 3a | Vault trade adapter (unshield → DEX → reshield) | **App live** |
| 3b | Sealed-size private trade | **Live (dev keys)** — [SEALED_TRADE.md](./SEALED_TRADE.md) |
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
| Sealed swap circuit | `circuits/sealedSwap/` |
| Dual verifier | `src/verifiers/DualProofVerifier.sol` |
| Sealed swap verifier | `src/verifiers/SealedSwap*.sol` |
| Pool | `src/ShieldPoolPoseidon.sol` |
| App artifacts | `app/public/circuits/*.wasm` + `*_final.zkey` |

### Proof public inputs (v2)

**Unshield (5):** `[root, nullifier, asset, amount, to]`  
**Transfer (4):** `[root, nullifier, newC0, newC1]`  
**Sealed swap (9):** `[root, nullifier, newCOut, newCChange, assetIn, assetOut, amountOutMin, rateIn, rateOut]`  

App privacy default: publish `amountOutMin = 1` so size is not leaked as min-out (see `app/src/lib/privacy.ts`).

## App integration

```
app/src/lib/config.ts          → sealed Poseidon pool default (remap A488)
app/src/lib/shield.ts          → ABI, local notes, gas limits
app/src/lib/treeSync.ts        → rebuild from Shielded + Transferred + SealedSwapped
app/src/lib/proveClient.ts     → browser snarkjs
app/.../ShieldView.tsx         → deposit
app/.../MoveView.tsx           → private send + cash out
app/.../SealedTradePanel.tsx   → private trade
app/.../VaultTradePanel.tsx    → via-market adapter
```

## Scripts

```bash
# Inventory seed (faucet stocks into vault for cash-out solvency)
forge script script/SeedVaultInventory.s.sol --rpc-url $RH_TESTNET_RPC --broadcast
```
