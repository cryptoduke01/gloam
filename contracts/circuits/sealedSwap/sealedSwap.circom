pragma circom 2.1.6;

/**
 * Gloam sealed-size private swap (v0 circuit — not deployed yet).
 *
 * Spend one vault note (assetIn) → output note (assetOut) + change (assetIn).
 * Actual trade size is PRIVATE. Public only:
 *   root, nullifier, newCommitmentOut, newCommitmentChange,
 *   assetIn, assetOut, amountOutMin, rateIn, rateOut
 *
 * Rate: amountOut * rateOut === amountSwap * rateIn
 * (fixed public testnet rates / later oracle-bound).
 * amountOut >= amountOutMin (slippage floor, public).
 *
 * Public layout (for future DualProof / SealedSwap verifier): 9 signals
 *   [root, nullifier, newCOut, newCChange, assetIn, assetOut, amountOutMin, rateIn, rateOut]
 *
 * Does NOT yet call a DEX. Settlement contract must credit assetOut inventory.
 */

// merkle_poseidon pulls poseidon; add comparators once for GreaterEqThan
include "../common/merkle_poseidon.circom";
include "circomlib/circuits/comparators.circom";

template SealedSwap(levels) {
    // ── public ──
    signal input root;
    signal input nullifier;
    signal input newCommitmentOut;
    signal input newCommitmentChange;
    signal input assetIn;
    signal input assetOut;
    signal input amountOutMin;
    signal input rateIn;
    signal input rateOut;

    // ── private ──
    signal input secretIn;
    signal input amountIn;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input secretOut;
    signal input amountOut;
    signal input secretChange;
    signal input amountChange;
    signal input amountSwap; // portion of amountIn sold

    // 1) Open spent note (assetIn)
    component commitIn = Poseidon(3);
    commitIn.inputs[0] <== secretIn;
    commitIn.inputs[1] <== amountIn;
    commitIn.inputs[2] <== assetIn;

    // 2) Nullifier
    component nullH = Poseidon(2);
    nullH.inputs[0] <== secretIn;
    nullH.inputs[1] <== commitIn.out;
    nullifier === nullH.out;

    // 3) Merkle membership
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitIn.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // 4) Conservation of assetIn
    amountIn === amountSwap + amountChange;

    // 5) Fixed-rate swap: amountOut * rateOut === amountSwap * rateIn
    signal lhs;
    signal rhs;
    lhs <== amountOut * rateOut;
    rhs <== amountSwap * rateIn;
    lhs === rhs;

    // 6) Slippage: amountOut >= amountOutMin (252-bit for wei-scale amounts)
    component gte = GreaterEqThan(252);
    gte.in[0] <== amountOut;
    gte.in[1] <== amountOutMin;
    gte.out === 1;

    // 7) Output note (assetOut)
    component commitOut = Poseidon(3);
    commitOut.inputs[0] <== secretOut;
    commitOut.inputs[1] <== amountOut;
    commitOut.inputs[2] <== assetOut;
    newCommitmentOut === commitOut.out;

    // 8) Change note (assetIn)
    component commitChg = Poseidon(3);
    commitChg.inputs[0] <== secretChange;
    commitChg.inputs[1] <== amountChange;
    commitChg.inputs[2] <== assetIn;
    newCommitmentChange === commitChg.out;
}

component main {
    public [
        root,
        nullifier,
        newCommitmentOut,
        newCommitmentChange,
        assetIn,
        assetOut,
        amountOutMin,
        rateIn,
        rateOut
    ]
} = SealedSwap(20);
