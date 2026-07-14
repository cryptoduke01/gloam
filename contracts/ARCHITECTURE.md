# Shield architecture (v1)

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
                           ├ commitments (Merkle leaves)
                           ├ spent nullifiers
                           └ currentRoot
```

### Phases

| Phase | What ships | Custody |
| --- | --- | --- |
| **0** | Interfaces + scaffold | Commitments only |
| **1 (live RH testnet)** | ETH/ERC-20 `shield`, keccak Merkle, `deposited[]` | **Pool holds assets** · verifier = 0 |
| **2 (source ready)** | NoteLib binding · unshield/transfer public inputs bind amount/asset/recipient · circuits spec | Redeploy + real verifier next |
| **3** | Private trade adapter | Intent hidden until exit |

### Live deploy (Phase 1)

| | |
| --- | --- |
| ShieldPool | `0x2BD98196D90AB45D58843B4c8B8809aa34343d35` |
| Chain | 46630 |
| Proof layout on-chain | v1 (root + nullifier only if verifier were set) |
| Source proof layout | **v2** (`PROOF_LAYOUT_VERSION = 2`) — needs redeploy |

See [deployments/testnet.json](./deployments/testnet.json).

### Note scheme (Phase 2 — Poseidon, circuit-ready)

```
commitment = Poseidon(secret, amount, asset)
nullifier  = Poseidon(secret, commitment)
Merkle     = Poseidon(left, right)  // depth 20
```

| Piece | Location |
| --- | --- |
| Circuit | `circuits/unshield/unshield.circom` (**real constraints**, ~5.3k) |
| Verifier | `src/verifiers/UnshieldVerifier.sol` + `UnshieldIVerifier` |
| Solidity tree | `IncrementalMerkleTreePoseidon.sol` |
| App | `notePoseidon.ts`, `merklePoseidon.ts`, `proverPoseidon.ts` |

**Live RH pool `0x2BD9…` is still keccak Phase-1.** Poseidon verifier must not be set on it. Next deploy: Poseidon hashers → Poseidon pool → setVerifier.

### Legacy keccak notes (Phase-1 app)

```
commitment = keccak256(secret || amount || asset)  // NoteLib.sol / note.ts
```

### Proof public inputs (v2)

**Unshield:** `[root, nullifier, asset, amount, to]`  
**Transfer:** `[root, nullifier, newC0, newC1]`

## App integration

```
app/src/lib/shield.ts   → pool address, ABI, gas
app/src/lib/note.ts     → bound commitments (new deposits)
app/.../ShieldView.tsx  → live deposit
app/.../MoveView.tsx    → status until prover ships
```

## Threat model (short)

- **Hidden (goal):** amount while shielded, private graph  
- **Visible:** shield/unshield edges, contract calls, proof verification  
- **Never:** mock verifier that always returns true on a funded pool  

## Testnet policy

- Chain ID **46630** only for Gloam private deploys until private path works  
- No mainnet ShieldPool until audits + real verifier  
