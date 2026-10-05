pragma circom 2.1.6;

/**
 * Gloam proof of payment (receipt) for one note.
 *
 * Shows that `commitment` is a real note in the pool, of `asset`, worth at least
 * `minAmount`, and that the prover knows its secret. With reveal = 1 the exact
 * amount is shown (shownAmount == amount); with reveal = 0 it stays hidden
 * (shownAmount == 0). The nullifier is NOT revealed, so the receipt never lets
 * the verifier see when the note is later spent.
 *
 * Public inputs (order fixed, matches app/src/lib/proofs):
 *   [root, commitment, asset, minAmount, reveal, shownAmount, context]
 *
 * Private: secret, amount, pathElements[levels], pathIndices[levels]
 *
 * Verifier-side: `root` must be a known pool root, and pool.commitmentSeen(commitment).
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom"; // IsZero, GreaterEqThan (+ Num2Bits)
include "../common/merkle_poseidon.circom";

function MAX_AMOUNT_BITS() { return 128; }

template Receipt(levels) {
    // ── public ──
    signal input root;
    signal input commitment;
    signal input asset;
    signal input minAmount;
    signal input reveal;
    signal input shownAmount;
    signal input context;

    // ── private ──
    signal input secret;
    signal input amount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1) The public commitment opens to (secret, amount, asset).
    component commitH = Poseidon(3);
    commitH.inputs[0] <== secret;
    commitH.inputs[1] <== amount;
    commitH.inputs[2] <== asset;
    commitment === commitH.out;

    // 2) ...and is a leaf under root.
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitH.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 3) Secret non-zero.
    component secretZero = IsZero();
    secretZero.in <== secret;
    secretZero.out === 0;

    // 4) amount >= minAmount, both in range (Kensho C2 bound).
    component amtBits = Num2Bits(MAX_AMOUNT_BITS());
    amtBits.in <== amount;
    component minBits = Num2Bits(MAX_AMOUNT_BITS());
    minBits.in <== minAmount;
    component enough = GreaterEqThan(MAX_AMOUNT_BITS() + 1);
    enough.in[0] <== amount;
    enough.in[1] <== minAmount;
    enough.out === 1;

    // 5) Reveal is a choice: the exact amount, or nothing.
    reveal * (reveal - 1) === 0;
    shownAmount === reveal * amount;

    // 6) Bind the verifier context (label, expiry, chain, pool) into the proof.
    signal contextSquare;
    contextSquare <== context * context;
}

component main {public [root, commitment, asset, minAmount, reveal, shownAmount, context]} = Receipt(20);
