pragma circom 2.1.6;

/**
 * Gloam private transfer (send inside the vault).
 *
 * Spend one note → two new notes (payment + change). Same asset.
 * Value conservation: amountIn = amountPay + amountChange.
 *
 * Public inputs (ShieldPoolPoseidon transfer):
 *   [root, nullifier, newCommitment0, newCommitment1]
 *
 * newCommitment0 = payment note
 * newCommitment1 = change note (may be zero-amount only if we allow; require change secret non-zero always)
 *
 * Private:
 *   secretIn, amountIn, asset,
 *   pathElements, pathIndices,
 *   secretPay, amountPay,
 *   secretChange, amountChange
 */

include "circomlib/circuits/poseidon.circom";
include "../common/merkle_poseidon.circom";

template Transfer(levels) {
    // ── public ──
    signal input root;
    signal input nullifier;
    signal input newCommitment0;
    signal input newCommitment1;

    // ── private ──
    signal input secretIn;
    signal input amountIn;
    signal input asset;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input secretPay;
    signal input amountPay;
    signal input secretChange;
    signal input amountChange;

    // 1) Open spent note
    component commitIn = Poseidon(3);
    commitIn.inputs[0] <== secretIn;
    commitIn.inputs[1] <== amountIn;
    commitIn.inputs[2] <== asset;

    // 2) Nullifier
    component nullH = Poseidon(2);
    nullH.inputs[0] <== secretIn;
    nullH.inputs[1] <== commitIn.out;
    nullifier === nullH.out;

    // 3) Merkle membership of spent note
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitIn.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 4) Value conservation
    amountIn === amountPay + amountChange;

    // 5) New payment note
    component commitPay = Poseidon(3);
    commitPay.inputs[0] <== secretPay;
    commitPay.inputs[1] <== amountPay;
    commitPay.inputs[2] <== asset;
    newCommitment0 === commitPay.out;

    // 6) New change note
    component commitChg = Poseidon(3);
    commitChg.inputs[0] <== secretChange;
    commitChg.inputs[1] <== amountChange;
    commitChg.inputs[2] <== asset;
    newCommitment1 === commitChg.out;

    // 7) Secrets non-zero
    component z0 = IsZero();
    z0.in <== secretIn;
    z0.out === 0;
    component z1 = IsZero();
    z1.in <== secretPay;
    z1.out === 0;
    component z2 = IsZero();
    z2.in <== secretChange;
    z2.out === 0;
}

component main {public [root, nullifier, newCommitment0, newCommitment1]} = Transfer(20);
