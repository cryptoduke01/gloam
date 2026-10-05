import type { Address, Hex } from "viem";
import type { LocalNote } from "@/lib/shield";

/**
 * Gloam proofs: what a holder can show someone without opening their wallet.
 *
 * - "funds": I hold at least `threshold` of `asset` across up to four of my
 *   unspent notes. The balance itself stays hidden.
 * - "payment": I received a payment of `asset` (the amount shown, or only that
 *   it was at least `minAmount`), in a real Gloam transaction.
 *
 * Every proof is made for one named verifier: the label is bound into the proof,
 * so forwarding it to someone else shows who it was really for.
 */
export type ProofKind = "funds" | "payment";

/** Up to four notes can back one proof of funds (the circuit's fixed width). */
export const FUNDS_MAX_NOTES = 4;

type ProofBase = {
  v: 1;
  chainId: number;
  pool: Address;
  /** Who the proof is for, in plain words ("Acme Bank", "my landlord"). */
  verifier: string;
  /** Unix seconds; the verify page flags proofs older than this. */
  expiresAt: number;
  /** Raw snarkjs Groth16 proof and its public signals (decimal strings). */
  proof: unknown;
  publicSignals: string[];
};

export type FundsProof = ProofBase & {
  kind: "funds";
  asset: Address;
  /** Smallest-unit amount the holder proves they hold at least. */
  threshold: string;
  /** The tree root the notes were proven against. */
  root: Hex;
  /** One per backing note, so the verifier can confirm none are spent. */
  nullifiers: Hex[];
};

export type PaymentProof = ProofBase & {
  kind: "payment";
  asset: Address;
  /** The payment note's commitment, the on-chain anchor of the receipt. */
  commitment: Hex;
  /** Shown amount (smallest unit) when the holder chose to reveal it, else null. */
  amount: string | null;
  /** When the amount is hidden: the payment was at least this much. */
  minAmount: string;
  /** Transaction that created the payment note, when the holder knows it. */
  txHash: Hex | null;
};

export type AnyProof = FundsProof | PaymentProof;

export type ProveFundsArgs = {
  chainId: number;
  pool: Address;
  asset: Address;
  threshold: bigint;
  /** 1 to 4 unspent, circuit-compatible notes of `asset`, with secrets. */
  notes: LocalNote[];
  verifier: string;
  /** Defaults to 7 days from now. */
  expiresAt?: number;
};

export type ProvePaymentArgs = {
  chainId: number;
  pool: Address;
  /** The received payment note (secret known), circuit-compatible. */
  note: LocalNote;
  reveal: boolean;
  /** Used when reveal is false; defaults to the note's amount. */
  minAmount?: bigint;
  verifier: string;
  expiresAt?: number;
};

export type CheckState = "pass" | "fail" | "unknown";

export type VerifyResult = {
  ok: boolean;
  kind: ProofKind;
  /** Each check the verifier ran, in order, for display. */
  checks: { label: string; state: CheckState; detail?: string }[];
  /** For payment proofs: when the payment landed on chain, if found. */
  paidAt?: number;
  expired: boolean;
};
