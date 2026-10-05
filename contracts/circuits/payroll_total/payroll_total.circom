pragma circom 2.1.6;

/**
 * Gloam payroll total ("this run paid exactly `total` of `asset` in `count`
 * private payments, and I made every one of them").
 *
 * Each payroll payment is a private transfer: the employer spends one of their
 * notes into a payment note (newCommitments[0]) and change (newCommitments[1]),
 * and the pool emits Transferred(nullifier, newCommitments). The employer
 * created the payment note, so it knows its secret and amount.
 *
 * Up to N payments per proof. Per used slot the prover opens:
 *   - the payment note:  commitment = Poseidon(secret, amount, asset)
 *   - the note it spent: nullifier  = Poseidon(spendSecret, Poseidon(spendSecret, spendAmount, asset))
 * The second opening is what ties the payment to the prover: only whoever held
 * the spent note knows spendSecret, so a payment the prover merely RECEIVED
 * (they know its secret, not the sender's) cannot be counted as one they made.
 *
 * Public inputs (order fixed, matches app/src/lib/proofs):
 *   [asset, total, count, paymentsHash, context]
 *
 *   paymentsHash = h_N, with h_0 = 0 and
 *   h_{i+1} = Poseidon(h_i, commitment[i], nullifier[i]) over ALL N slots
 *   (empty slots hash in as 0, 0). Used slots come first.
 *
 * Private, per slot i:
 *   used[i], secret[i], amount[i], commitment[i],
 *   spendSecret[i], spendAmount[i], nullifier[i]
 *
 * Verifier-side (NOT in this circuit): the plain (commitment, nullifier) list
 * travels with the proof and must rehash to paymentsHash; commitments and
 * nullifiers must each be pairwise distinct; and for every pair the pool must
 * have emitted Transferred(nullifier, [commitment, change]) in a successful
 * transaction, which shows the payment is a real private payment in the vault
 * (not a deposit or a trade output).
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom"; // IsZero (+ Num2Bits)

// Kensho C2: every amount < 2^128, so a sum of N <= 2^5 payments stays below
// 2^133 and can never wrap the BN254 field.
function MAX_AMOUNT_BITS() { return 128; }

template PayrollTotal(nSlots) {
    // ── public ──
    signal input asset;
    signal input total;
    signal input count;
    signal input paymentsHash;
    signal input context;

    // ── private ──
    signal input used[nSlots];
    signal input secret[nSlots];
    signal input amount[nSlots];
    signal input commitment[nSlots];
    signal input spendSecret[nSlots];
    signal input spendAmount[nSlots];
    signal input nullifier[nSlots];

    component amtBits[nSlots];
    component amtZero[nSlots];
    component commitH[nSlots];
    component secretZero[nSlots];
    component spendCommitH[nSlots];
    component spendNullH[nSlots];
    component spendSecretZero[nSlots];
    component chain[nSlots];

    signal acc[nSlots + 1];
    acc[0] <== 0;

    var usedCount = 0;
    var sum = 0;

    for (var i = 0; i < nSlots; i++) {
        // 1) Slot flag is 0 or 1, and used slots come first (one canonical
        //    layout, so the verifier can rebuild the list by padding with zeros).
        used[i] * (used[i] - 1) === 0;
        if (i > 0) {
            used[i] * (1 - used[i - 1]) === 0;
        }

        // 2) Amount in range on every slot, above zero on used ones, zero on empty ones.
        amtBits[i] = Num2Bits(MAX_AMOUNT_BITS());
        amtBits[i].in <== amount[i];
        amtZero[i] = IsZero();
        amtZero[i].in <== amount[i];
        amtZero[i].out * used[i] === 0;
        amount[i] * (1 - used[i]) === 0;

        // 3) The payment note opens under the PUBLIC asset; empty slots carry commitment 0.
        commitH[i] = Poseidon(3);
        commitH[i].inputs[0] <== secret[i];
        commitH[i].inputs[1] <== amount[i];
        commitH[i].inputs[2] <== asset;
        commitment[i] === used[i] * commitH[i].out;

        secretZero[i] = IsZero();
        secretZero[i].in <== secret[i];
        secretZero[i].out * used[i] === 0;

        // 4) The prover spent the note that funded it: the transfer's public
        //    nullifier is this note's real nullifier. Same asset (transfers never
        //    change asset). Empty slots carry nullifier 0.
        spendCommitH[i] = Poseidon(3);
        spendCommitH[i].inputs[0] <== spendSecret[i];
        spendCommitH[i].inputs[1] <== spendAmount[i];
        spendCommitH[i].inputs[2] <== asset;
        spendNullH[i] = Poseidon(2);
        spendNullH[i].inputs[0] <== spendSecret[i];
        spendNullH[i].inputs[1] <== spendCommitH[i].out;
        nullifier[i] === used[i] * spendNullH[i].out;

        spendSecretZero[i] = IsZero();
        spendSecretZero[i].in <== spendSecret[i];
        spendSecretZero[i].out * used[i] === 0;

        // 5) Fold the slot into the public list hash.
        chain[i] = Poseidon(3);
        chain[i].inputs[0] <== acc[i];
        chain[i].inputs[1] <== commitment[i];
        chain[i].inputs[2] <== nullifier[i];
        acc[i + 1] <== chain[i].out;

        usedCount += used[i];
        sum += amount[i];
    }

    // 6) The totals: exactly the sum of the used amounts, over exactly count payments.
    total === sum;
    count === usedCount;

    // 7) At least one payment.
    component noneUsed = IsZero();
    noneUsed.in <== count;
    noneUsed.out === 0;

    // 8) The list the verifier is shown is the list that was proven.
    paymentsHash === acc[nSlots];

    // 9) Bind the verifier context (label, expiry, chain, pool) into the proof.
    signal contextSquare;
    contextSquare <== context * context;
}

component main {public [asset, total, count, paymentsHash, context]} = PayrollTotal(32);
