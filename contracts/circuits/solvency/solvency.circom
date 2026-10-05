pragma circom 2.1.6;

/**
 * Gloam proof of funds ("I hold at least `threshold` of `asset`").
 *
 * Up to N notes of ONE asset back the claim. Each slot is either used (a real,
 * unspent-at-verify-time note under `root`) or empty (amount 0, nullifier 0).
 * The balance itself and which leaves back it stay private.
 *
 * Public inputs (order fixed, matches app/src/lib/proofs):
 *   [root, asset, threshold, context, nullifier[0..N-1]]
 *
 * Private, per slot i:
 *   used[i], secret[i], amount[i], pathElements[i][levels], pathIndices[i][levels]
 *
 * Note scheme is the pool's (transfer.circom):
 *   commitment = Poseidon(secret, amount, asset)
 *   nullifier  = Poseidon(secret, commitment)
 *
 * The nullifiers are revealed so the verifier can confirm on chain that no
 * backing note is spent. Verifier-side (NOT in this circuit): nullifiers must be
 * pairwise distinct (the same note in two slots would double count) and
 * pool.spent(n) must be false for every non-zero one; `root` must be a known
 * pool root.
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom"; // IsZero, GreaterEqThan (+ Num2Bits)
include "../common/merkle_poseidon.circom";      // DualMux, HashLeftRight

// Kensho C2: every amount < 2^128, so a sum of N <= 4 notes stays < 2^130 and
// can never wrap the BN254 field.
function MAX_AMOUNT_BITS() { return 128; }

/**
 * The root a leaf hashes up to along a path. Same hashing as MerkleTreeChecker,
 * minus its final `root ===`, so the caller can gate the check on a flag.
 */
template MerkleRootOf(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component selectors[levels];
    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== leaf;
    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux(); // also forces pathIndices[i] boolean
        selectors[i].in[0] <== hashes[i];
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];
        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].out[0];
        hashers[i].right <== selectors[i].out[1];
        hashes[i + 1] <== hashers[i].hash;
    }
    root <== hashes[levels];
}

template Solvency(nNotes, levels) {
    // ── public ──
    signal input root;
    signal input asset;
    signal input threshold;
    signal input context;
    signal input nullifier[nNotes];

    // ── private ──
    signal input used[nNotes];
    signal input secret[nNotes];
    signal input amount[nNotes];
    signal input pathElements[nNotes][levels];
    signal input pathIndices[nNotes][levels];

    component commitH[nNotes];
    component nullH[nNotes];
    component tree[nNotes];
    component secretZero[nNotes];
    component amtBits[nNotes];

    var usedCount = 0;
    var total = 0;

    for (var i = 0; i < nNotes; i++) {
        // 1) Slot flag is 0 or 1.
        used[i] * (used[i] - 1) === 0;

        // 2) Amount in range (all slots; empty ones are pinned to 0 below).
        amtBits[i] = Num2Bits(MAX_AMOUNT_BITS());
        amtBits[i].in <== amount[i];

        // 3) Open the note under the PUBLIC asset, so every slot is the same asset.
        commitH[i] = Poseidon(3);
        commitH[i].inputs[0] <== secret[i];
        commitH[i].inputs[1] <== amount[i];
        commitH[i].inputs[2] <== asset;

        // 4) Membership, only enforced for used slots.
        tree[i] = MerkleRootOf(levels);
        tree[i].leaf <== commitH[i].out;
        for (var j = 0; j < levels; j++) {
            tree[i].pathElements[j] <== pathElements[i][j];
            tree[i].pathIndices[j] <== pathIndices[i][j];
        }
        (tree[i].root - root) * used[i] === 0;

        // 5) Used slots have a non-zero secret (a zero secret is a guessable note).
        secretZero[i] = IsZero();
        secretZero[i].in <== secret[i];
        secretZero[i].out * used[i] === 0;

        // 6) Nullifier is the note's real spend nullifier when used, 0 when empty.
        nullH[i] = Poseidon(2);
        nullH[i].inputs[0] <== secret[i];
        nullH[i].inputs[1] <== commitH[i].out;
        nullifier[i] === used[i] * nullH[i].out;

        // 7) Empty slots carry nothing.
        amount[i] * (1 - used[i]) === 0;

        usedCount += used[i];
        total += amount[i];
    }

    // 8) At least one real note backs the claim.
    component noneUsed = IsZero();
    noneUsed.in <== usedCount;
    noneUsed.out === 0;

    // 9) sum(amounts) >= threshold. threshold is range checked so the comparator
    //    sees two in-range integers (total < 2^130, threshold < 2^128).
    component thrBits = Num2Bits(MAX_AMOUNT_BITS());
    thrBits.in <== threshold;
    component enough = GreaterEqThan(MAX_AMOUNT_BITS() + 2);
    enough.in[0] <== total;
    enough.in[1] <== threshold;
    enough.out === 1;

    // 10) Bind the verifier context (label, expiry, chain, pool) into the proof.
    signal contextSquare;
    contextSquare <== context * context;
}

component main {public [root, asset, threshold, context, nullifier]} = Solvency(4, 20);
