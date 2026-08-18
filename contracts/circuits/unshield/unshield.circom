pragma circom 2.1.6;

/**
 * Gloam unshield — REAL constraints (Poseidon).
 *
 * Public (PROOF_LAYOUT_VERSION = 2):
 *   root, nullifier, asset, amount, recipient
 *
 * Private:
 *   secret, pathElements[levels], pathIndices[levels]
 *
 * Note scheme (must match app/src/lib/note.ts + NoteLibPoseidon.sol):
 *   commitment = Poseidon(secret, amount, asset)
 *   nullifier  = Poseidon(secret, commitment)
 *
 * Merkle: Poseidon(left, right), pathIndices 0 = current is left child.
 *
 * On-chain pool for this scheme is the Poseidon tree (next deploy).
 * Live RH keccak pool is Phase-1 only — do not set this verifier there without matching tree.
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Max bits for any note amount. 128 bits (~3.4e38) is far above any real
// token amount and far below the BN254 field (~2^253), so amounts can never
// wrap the field when summed in transfer/sealedSwap conservation checks.
// Kensho C2: without this bound a witness can inflate value via field overflow.
function MAX_AMOUNT_BITS() { return 128; }

template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// s = 0: out = [in[0], in[1]]; s = 1: out = [in[1], in[0]]
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component selectors[levels];
    component hashers[levels];

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== hashes[i];
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].out[0];
        hashers[i].right <== selectors[i].out[1];
        hashes[i + 1] <== hashers[i].hash;
    }

    root === hashes[levels];
}

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

    // 0) Range-check amount so the note value is a real, in-range integer
    // (defense in depth: keeps every note's amount < 2^128, matching transfer).
    component amtBits = Num2Bits(MAX_AMOUNT_BITS());
    amtBits.in <== amount;

    // 1) Open note
    component commitH = Poseidon(3);
    commitH.inputs[0] <== secret;
    commitH.inputs[1] <== amount;
    commitH.inputs[2] <== asset;

    // 2) Nullifier binds secret + commitment
    component nullH = Poseidon(2);
    nullH.inputs[0] <== secret;
    nullH.inputs[1] <== commitH.out;
    nullifier === nullH.out;

    // 3) Merkle membership
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitH.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 4) Recipient is public (used by verifier public inputs / pool payout)
    signal recipientSquare;
    recipientSquare <== recipient * recipient;

    // 5) Secret non-zero
    component isz = IsZero();
    isz.in <== secret;
    isz.out === 0;
}

// IsZero is provided by circomlib/circuits/comparators.circom (via bitify include).

// Depth 20 matches pool capacity 2^20
component main {public [root, nullifier, asset, amount, recipient]} = Unshield(20);
