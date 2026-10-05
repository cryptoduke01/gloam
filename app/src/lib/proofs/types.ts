import type { Address, Hex } from "viem";
import type { LocalNote } from "@/lib/shield";

/**
 * Gloam proofs: what a holder can show someone without opening their wallet.
 *
 * - "funds": I hold at least `threshold` of `asset` across up to four of my
 *   unspent notes. The balance itself stays hidden.
 * - "payment": I received a payment of `asset` (the amount shown, or only that
 *   it was at least `minAmount`), in a real Gloam transaction.
 * - "payroll": a payroll run I sent paid exactly `total` of `asset` in `count`
 *   private payments. No single payment's amount is shown.
 *
 * Every proof is made for one named verifier: the label is bound into the proof,
 * so forwarding it to someone else shows who it was really for.
 */
export type ProofKind = "funds" | "payment" | "payroll";

/** Up to four notes can back one proof of funds (the circuit's fixed width). */
export const FUNDS_MAX_NOTES = 4;

/** Payments per payroll proof part (the payroll_total circuit's fixed width). */
export const PAYROLL_MAX_PAYMENTS = 32;

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

/** One payroll payment as the verifier sees it. Its amount never leaves the prover. */
export type PayrollPayment = {
  /** The payee's note, created by the payment (Transferred newCommitments[0]). */
  commitment: Hex;
  /** The spend marker of the payer's note that funded it (Transferred nullifier). */
  nullifier: Hex;
  /** The transaction that made the payment, when known. */
  txHash: Hex | null;
};

/** One Groth16 proof over up to PAYROLL_MAX_PAYMENTS payments. */
export type PayrollProofPart = {
  proof: unknown;
  /** [asset, total, count, paymentsHash, context] */
  publicSignals: string[];
};

export type PayrollProof = Omit<ProofBase, "proof" | "publicSignals"> & {
  kind: "payroll";
  asset: Address;
  /** Smallest-unit sum of every payment, across all parts. */
  total: string;
  /** Number of payments, across all parts. */
  count: number;
  /** Every payment in order; each part covers the next `count` of them (its signal). */
  payments: PayrollPayment[];
  /** Most runs fit one part; larger ones are split evenly (payrollParts in the SDK). */
  parts: PayrollProofPart[];
};

export type AnyProof = FundsProof | PaymentProof | PayrollProof;

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

/** A payroll payment the prover made, with what opening it needs. */
export type PayrollNote = {
  /** The payee note: its secret and amount (the payer created it). */
  secret: Hex;
  amount: bigint;
  commitment: Hex;
  /** The payer's note the payment spent: its secret and amount, and its spend marker. */
  spendSecret: Hex;
  spendAmount: bigint;
  nullifier: Hex;
  txHash: Hex | null;
};

export type ProvePayrollArgs = {
  chainId: number;
  pool: Address;
  asset: Address;
  /** Every paid payment of the run, in order. */
  payments: PayrollNote[];
  verifier: string;
  expiresAt?: number;
  /** Called as each part finishes, for runs that need more than one. */
  onPart?: (done: number, of: number) => void;
};

export type CheckState = "pass" | "fail" | "unknown";

export type VerifyResult = {
  ok: boolean;
  kind: ProofKind;
  /** Each check the verifier ran, in order, for display. */
  checks: { label: string; state: CheckState; detail?: string }[];
  /** For payment proofs: when the payment landed on chain, if found. */
  paidAt?: number;
  /** For payroll proofs: when the first and last payment landed, if all were found. */
  paidBetween?: [number, number];
  expired: boolean;
};
