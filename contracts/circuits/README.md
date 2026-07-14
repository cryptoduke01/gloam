# Gloam circuits (Phase 2)

Proof system TBD (Groth16 / Plonk). **Do not deploy a mock verifier that always returns true on a funded pool.**

## Note scheme (must match `NoteLib.sol` + `app/src/lib/note.ts`)

```
secret        ← 32 random bytes (wallet / browser only)
amount        ← uint256
asset         ← address (0 = ETH)

commitment = keccak256(secret || amount || asset)   // abi.encodePacked
nullifier  = keccak256(secret || commitment)
```

Phase-1 deposits that used a random unbound commitment cannot open under this scheme — only notes created after the app bound commitments.

## Unshield circuit (goal)

**Private inputs:** `secret`, Merkle path to `commitment`, `leafIndex`  
**Public inputs (order fixed, `PROOF_LAYOUT_VERSION = 2`):**

| Index | Name | Notes |
| --- | --- | --- |
| 0 | `root` | Must be a known ShieldPool root |
| 1 | `nullifier` | Marks note spent |
| 2 | `asset` | `uint160` cast |
| 3 | `amount` | Exact exit amount |
| 4 | `to` | Recipient `uint160` |

**Constraints:**

1. `commitment = H(secret, amount, asset)`
2. Merkle path proves `commitment` ∈ tree at `root`
3. `nullifier = H(secret, commitment)`
4. Range / field checks as required by the snark backend

## Transfer circuit (goal)

Spend one note → two new commitments (change + send).

**Public inputs:**

| Index | Name |
| --- | --- |
| 0 | `root` |
| 1 | `nullifier` |
| 2 | `newCommitment0` |
| 3 | `newCommitment1` |

**Private:** secret, amount/asset of spent note, split amounts, new secrets, Merkle path.  
Value conservation: `amount_in = amount_out0 + amount_out1` (same asset).

## Repo layout (next)

```
circuits/
  README.md          ← you are here
  unshield/          ← circom or noir source (TBD)
  transfer/
  keys/              ← never commit toxic waste; only verifying keys
```

## Offchain stack (app)

| Module | Role |
| --- | --- |
| `app/src/lib/merkle.ts` | Keccak tree = Solidity |
| `app/src/lib/treeSync.ts` | Rebuild leaves from `Shielded` events |
| `app/src/lib/prover.ts` | Pack unshield witness (no snark yet) |
| `app/.../MoveView` | Resync tree + “Build unshield witness” |

## Ship order

1. ~~NoteLib + pool public-input layout~~ (contracts)
2. ~~TS note helpers matching NoteLib~~ (app)
3. ~~Merkle path + tree sync + witness pack~~ (app)
4. Circom/Noir unshield → trusted setup → `Groth16Verifier.sol`
5. Deploy verifier, `setVerifier` only after verification tests
6. Wire Move / Unshield UI to real proofs only

## Tools

```bash
# one-time
cargo install --git https://github.com/iden3/circom.git --tag v2.1.9 circom
cd contracts/circuits
npm i snarkjs@0.7.5
npm run check-tools

# compile scaffold circuit
mkdir -p build/unshield
circom unshield/unshield.circom --r1cs --wasm --sym -o build/unshield

# full groth16 pipeline (dev ceremony — NOT production)
# see scripts in package history / snarkjs docs; keys land in build/
```

### Scaffold verifier (generated)

`src/verifiers/ScaffoldUnshieldVerifier.sol` + `ScaffoldIVerifier.sol` adapt snarkjs → `IVerifier`.

**Never `setVerifier` these on a funded pool.** The circuit is a placeholder (no note open / Merkle). They exist so the compile → prove → Solidity path is proven end-to-end.

## Safety

- Live RH testnet pool (`0x2BD9…`) is **Phase-1** (verifier = 0). Redeploy or carefully migrate for layout v2.
- Unit tests may use `MockVerifier`; production never does.
