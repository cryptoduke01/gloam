pragma circom 2.1.6;

/*
 * Gloam unshield — SCAFFOLD (does not compile into production keys yet).
 *
 * Live ShieldPool uses keccak Merkle + NoteLib keccak commitments.
 * Production circuits usually use Poseidon; either:
 *   A) migrate pool tree + NoteLib to Poseidon (preferred for snarks), or
 *   B) use a keccak gadget (heavy) matching Solidity bit-for-bit.
 *
 * Public inputs order MUST match ShieldPool PROOF_LAYOUT_VERSION = 2:
 *   [root, nullifier, asset, amount, recipient]
 *
 * Install circom, then flesh out Poseidon Merkle + note openers.
 */

// template Poseidon(n) — from circomlib when vendored
// template MerkleTreeChecker(levels) — from circomlib when vendored

template Unshield(levels) {
    // ── public ──
    signal input root;
    signal input nullifier;
    signal input asset;
    signal input amount;
    signal input recipient;

    // ── private ──
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Placeholder constraints so the template is well-formed.
    // Replace with: commitment <== Poseidon([secret, amount, asset]);
    //               nullifier <== Poseidon([secret, commitment]);
    //               MerkleTreeChecker(levels)(commitment, pathElements, pathIndices, root);

    signal secret_sq;
    secret_sq <== secret * secret;

    // Force public inputs to be used (avoid optimized-out)
    signal pub_sum;
    pub_sum <== root + nullifier + asset + amount + recipient;
    signal pub_sq;
    pub_sq <== pub_sum * pub_sum;

    // Dummy path touch
    signal path0;
    path0 <== pathElements[0] * pathIndices[0];
}

component main {public [root, nullifier, asset, amount, recipient]} = Unshield(20);
