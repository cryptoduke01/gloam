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

## Ship order

1. ~~NoteLib + pool public-input layout~~ (contracts)
2. ~~TS note helpers matching NoteLib~~ (app)
3. Circom/Noir unshield → trusted setup / universal setup → `Groth16Verifier.sol`
4. Deploy verifier, `setVerifier` only after verification tests
5. Wire Move / Unshield UI to real proofs only

## Safety

- Live RH testnet pool (`0x2BD9…`) is **Phase-1** (verifier = 0). Redeploy or carefully migrate for layout v2.
- Unit tests may use `MockVerifier`; production never does.
