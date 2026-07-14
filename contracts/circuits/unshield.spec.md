# Unshield circuit — constraint sketch

Pseudocode for implementers (not compilable). Aligns with `NoteLib` + `ShieldPool._requireUnshieldProof`.

```
// ── public ──
signal input root;
signal input nullifier;
signal input asset;      // uint160 as field
signal input amount;
signal input recipient;  // uint160 as field

// ── private ──
signal input secret;
signal input pathElements[DEPTH];
signal input pathIndices[DEPTH];

// 1. Open note
commitment <== KeccakPack(secret, amount, asset);

// 2. Merkle membership (keccak tree depth 20 — same as IncrementalMerkleTree)
root_calc <== MerkleKeccak(commitment, pathElements, pathIndices);
root_calc === root;

// 3. Nullifier
nullifier_calc <== KeccakPack(secret, commitment);
nullifier_calc === nullifier;

// 4. Non-zero secret (optional anti-malleability)
secret =!= 0;
```

**On-chain after proof verifies:** mark `nullifier` spent, pay `amount` of `asset` to `recipient`.

**Not in circuit:** encrypted note payload (offchain / separate memo).
