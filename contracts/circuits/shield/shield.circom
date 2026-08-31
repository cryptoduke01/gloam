pragma circom 2.1.6;

/**
 * Gloam shield (deposit) proof — binds note value to the deposited amount.
 *
 * Kensho C1 fix. The pool's shield(asset, amount, commitment) inserts a raw,
 * client-supplied commitment with no check that it encodes `amount`. That lets a
 * user deposit a small amount but embed a large one in the commitment, then
 * unshield the large amount and drain other users. This circuit closes the gap:
 * the depositor must prove the leaf they insert opens to the PUBLIC (amount, asset)
 * under some secret. The pool verifies it against the public deposit args, so the
 * committed value can no longer diverge from the funds actually sent.
 *
 * Public inputs (must match ShieldPoolPoseidon.shield binding): [commitment, amount, asset]
 * Private: secret
 *
 * Note scheme is UNCHANGED (commitment = Poseidon(secret, amount, asset)), so the
 * existing unshield/transfer circuits and verifiers keep working as-is.
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom"; // IsZero + (via bitify) Num2Bits

function MAX_AMOUNT_BITS() { return 128; }

template Shield() {
    // ── public ──
    signal input commitment;
    signal input amount;
    signal input asset;

    // ── private ──
    signal input secret;

    // Amount must be a real, in-range integer (same 2^128 bound as every note).
    component amtBits = Num2Bits(MAX_AMOUNT_BITS());
    amtBits.in <== amount;

    // Commitment must open to exactly (secret, amount, asset).
    component commitH = Poseidon(3);
    commitH.inputs[0] <== secret;
    commitH.inputs[1] <== amount;
    commitH.inputs[2] <== asset;
    commitment === commitH.out;

    // Secret non-zero (a zero secret is a degenerate, guessable note).
    component isz = IsZero();
    isz.in <== secret;
    isz.out === 0;
}

component main {public [commitment, amount, asset]} = Shield();
