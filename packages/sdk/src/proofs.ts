/**
 * Witness builders for the holder proofs (contracts/circuits/solvency,
 * contracts/circuits/receipt and contracts/circuits/payroll_total). Pure like
 * ./witness.ts: each returns the circom input plus the public signals the proof
 * must carry; proving is separate.
 *
 *   funds    "I hold at least `threshold` of `asset`" from 1 to 4 unspent notes.
 *            Public: [root, asset, threshold, context, nullifier0..3]
 *   receipt  "this note is a real payment of `asset`, worth `shownAmount` (or at
 *            least `minAmount`)". Public: [root, commitment, asset, minAmount,
 *            reveal, shownAmount, context]
 *   payroll  "these `count` private payments I made add up to exactly `total` of
 *            `asset`", 1 to 32 payments per proof, no single amount shown.
 *            Public: [asset, total, count, paymentsHash, context]
 *
 * `context` ties a proof to one verifier, expiry, chain and pool (proofContext),
 * so a proof made for one party cannot be passed off as made for another.
 */

import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { FIELD_PRIME } from "./constants.js";
import { MERKLE_DEPTH, type PoseidonMerklePath } from "./merkle.js";
import { noteCommitmentPoseidon, noteNullifierPoseidon } from "./note.js";
import { hexToField, poseidon3, toField } from "./poseidon.js";

/** Fixed slot count of the funds circuit. */
export const FUNDS_PROOF_SLOTS = 4;

/** Public signal order of each circuit (snarkjs publicSignals). */
export const FUNDS_PUBLIC_SIGNALS = [
  "root",
  "asset",
  "threshold",
  "context",
  "nullifier0",
  "nullifier1",
  "nullifier2",
  "nullifier3",
] as const;
export const RECEIPT_PUBLIC_SIGNALS = [
  "root",
  "commitment",
  "asset",
  "minAmount",
  "reveal",
  "shownAmount",
  "context",
] as const;

/** Fixed slot count of the payroll total circuit. */
export const PAYROLL_PROOF_SLOTS = 32;

export const PAYROLL_PUBLIC_SIGNALS = ["asset", "total", "count", "paymentsHash", "context"] as const;

/** Notes are range checked to < 2^128 in every Gloam circuit (Kensho C2). */
const AMOUNT_LIMIT = 1n << 128n;

const CONTEXT_DOMAIN = "gloam.proof.v1";

export type ProofContextArgs = {
  /**
   * What the proof claims. "payment" and "balance" share the receipt circuit,
   * so the kind in the context is what keeps one from passing as the other.
   */
  kind: "funds" | "payment" | "payroll" | "balance";
  chainId: number;
  pool: Address;
  /** Who the proof is for, exactly as shown to them. */
  verifier: string;
  /** Unix seconds. */
  expiresAt: number;
};

/**
 * The field element a proof is bound to:
 *
 *   keccak256(abi.encode("gloam.proof.v1", kind, chainId, pool, expiresAt, verifier)) mod p
 *
 * abi.encode (not packed) keeps the strings unambiguous. Anyone can recompute it
 * from the proof's plain fields and compare it with the `context` public signal.
 */
export function proofContext(args: ProofContextArgs): bigint {
  if (!Number.isSafeInteger(args.chainId) || args.chainId <= 0) throw new Error("Bad chain id.");
  if (!Number.isSafeInteger(args.expiresAt) || args.expiresAt < 0) throw new Error("Bad expiry.");
  const encoded = encodeAbiParameters(
    [
      { type: "string" },
      { type: "string" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint64" },
      { type: "string" },
    ],
    [
      CONTEXT_DOMAIN,
      args.kind,
      BigInt(args.chainId),
      args.pool.toLowerCase() as Address,
      BigInt(args.expiresAt),
      args.verifier,
    ]
  );
  return BigInt(keccak256(encoded)) % FIELD_PRIME;
}

// ── funds ───────────────────────────────────────────────────────────────────

export type FundsNoteInput = {
  secretHex: Hex;
  amount: bigint;
  /** Path of this note's leaf; every note must come from the same tree snapshot. */
  path: PoseidonMerklePath;
};

export type FundsWitness = {
  circomInput: Record<string, string | string[] | string[][]>;
  publicInputs: {
    root: bigint;
    asset: bigint;
    threshold: bigint;
    context: bigint;
    /** One per slot; 0 for empty slots. */
    nullifiers: bigint[];
  };
  /** The publicSignals a correct proof carries, in circuit order. */
  publicSignals: string[];
  /** Sum of the backing notes (stays private; for the holder's own display). */
  total: bigint;
  blocker: string | null;
};

export async function buildFundsWitness(args: {
  asset: Address;
  threshold: bigint;
  context: bigint;
  notes: FundsNoteInput[];
}): Promise<FundsWitness> {
  const assetField = toField(BigInt(args.asset));
  const n = args.notes.length;
  let blocker: string | null = null;
  if (n < 1 || n > FUNDS_PROOF_SLOTS) {
    blocker = `A proof of funds uses 1 to ${FUNDS_PROOF_SLOTS} notes.`;
  }
  if (!blocker && (args.threshold < 0n || args.threshold >= AMOUNT_LIMIT)) {
    blocker = "That amount is out of range.";
  }
  if (!blocker && (args.context < 0n || args.context >= FIELD_PRIME)) {
    blocker = "Bad proof context.";
  }

  const root = n ? args.notes[0]!.path.root : 0n;
  const used: string[] = [];
  const secrets: string[] = [];
  const amounts: string[] = [];
  const pathElements: string[][] = [];
  const pathIndices: string[][] = [];
  const nullifiers: bigint[] = [];
  let total = 0n;

  for (const note of args.notes.slice(0, FUNDS_PROOF_SLOTS)) {
    const secret = hexToField(note.secretHex);
    const commitment = await noteCommitmentPoseidon(secret, note.amount, args.asset);
    const nullifier = await noteNullifierPoseidon(secret, commitment);
    if (!blocker && secret === 0n) blocker = "A note has no secret, so it cannot back a proof.";
    if (!blocker && (note.amount < 0n || note.amount >= AMOUNT_LIMIT)) {
      blocker = "A note amount is out of range.";
    }
    if (!blocker && commitment !== note.path.leaf) {
      blocker = "A note's secret does not open its vault entry (wrong note or asset).";
    }
    if (!blocker && note.path.root !== root) {
      blocker = "Notes come from different vault snapshots. Sync and try again.";
    }
    if (!blocker && nullifiers.includes(nullifier)) {
      blocker = "The same note is listed twice.";
    }
    used.push("1");
    secrets.push(secret.toString());
    amounts.push(note.amount.toString());
    pathElements.push(note.path.pathElements.map((x) => x.toString()));
    pathIndices.push(note.path.pathIndices.map(String));
    nullifiers.push(nullifier);
    total += note.amount;
  }
  // Empty slots: amount 0, nullifier 0, any path (membership is not checked).
  while (used.length < FUNDS_PROOF_SLOTS) {
    used.push("0");
    secrets.push("0");
    amounts.push("0");
    pathElements.push(Array.from({ length: MERKLE_DEPTH }, () => "0"));
    pathIndices.push(Array.from({ length: MERKLE_DEPTH }, () => "0"));
    nullifiers.push(0n);
  }
  if (!blocker && total < args.threshold) {
    blocker = "These notes add up to less than the amount you want to prove.";
  }

  const publicInputs = {
    root,
    asset: assetField,
    threshold: args.threshold,
    context: args.context,
    nullifiers,
  };
  return {
    circomInput: {
      root: root.toString(),
      asset: assetField.toString(),
      threshold: args.threshold.toString(),
      context: args.context.toString(),
      nullifier: nullifiers.map(String),
      used,
      secret: secrets,
      amount: amounts,
      pathElements,
      pathIndices,
    },
    publicInputs,
    publicSignals: [root, assetField, args.threshold, args.context, ...nullifiers].map(String),
    total,
    blocker,
  };
}

/** Read a funds proof's public signals by name. */
export function readFundsSignals(signals: readonly string[]) {
  if (signals.length !== FUNDS_PUBLIC_SIGNALS.length) throw new Error("Wrong number of public signals.");
  const v = signals.map((s) => BigInt(s));
  return { root: v[0]!, asset: v[1]!, threshold: v[2]!, context: v[3]!, nullifiers: v.slice(4) };
}

// ── receipt ─────────────────────────────────────────────────────────────────

export type ReceiptWitness = {
  circomInput: Record<string, string | string[]>;
  publicInputs: {
    root: bigint;
    commitment: bigint;
    asset: bigint;
    minAmount: bigint;
    reveal: boolean;
    shownAmount: bigint;
    context: bigint;
  };
  publicSignals: string[];
  blocker: string | null;
};

export async function buildReceiptWitness(args: {
  secretHex: Hex;
  amount: bigint;
  asset: Address;
  path: PoseidonMerklePath;
  /** Show the exact amount (true) or only that it was at least minAmount. */
  reveal: boolean;
  /** Ignored when revealing (then it is the amount). Defaults to the amount. */
  minAmount?: bigint;
  context: bigint;
}): Promise<ReceiptWitness> {
  const secret = hexToField(args.secretHex);
  const assetField = toField(BigInt(args.asset));
  const commitment = await noteCommitmentPoseidon(secret, args.amount, args.asset);
  const minAmount = args.reveal ? args.amount : (args.minAmount ?? args.amount);
  const shownAmount = args.reveal ? args.amount : 0n;

  let blocker: string | null = null;
  if (secret === 0n) blocker = "This note has no secret, so it cannot back a receipt.";
  else if (args.amount < 0n || args.amount >= AMOUNT_LIMIT) blocker = "The note amount is out of range.";
  else if (minAmount < 0n) blocker = "The minimum cannot be negative.";
  else if (minAmount > args.amount) blocker = "The minimum is more than this payment.";
  else if (commitment !== args.path.leaf) blocker = "The secret does not open this vault entry (wrong note or asset).";
  else if (args.context < 0n || args.context >= FIELD_PRIME) blocker = "Bad proof context.";

  const reveal = args.reveal ? 1n : 0n;
  return {
    circomInput: {
      root: args.path.root.toString(),
      commitment: commitment.toString(),
      asset: assetField.toString(),
      minAmount: minAmount.toString(),
      reveal: reveal.toString(),
      shownAmount: shownAmount.toString(),
      context: args.context.toString(),
      secret: secret.toString(),
      amount: args.amount.toString(),
      pathElements: args.path.pathElements.map((x) => x.toString()),
      pathIndices: args.path.pathIndices.map(String),
    },
    publicInputs: {
      root: args.path.root,
      commitment,
      asset: assetField,
      minAmount,
      reveal: args.reveal,
      shownAmount,
      context: args.context,
    },
    publicSignals: [args.path.root, commitment, assetField, minAmount, reveal, shownAmount, args.context].map(String),
    blocker,
  };
}

/** Read a receipt proof's public signals by name. */
export function readReceiptSignals(signals: readonly string[]) {
  if (signals.length !== RECEIPT_PUBLIC_SIGNALS.length) throw new Error("Wrong number of public signals.");
  const v = signals.map((s) => BigInt(s));
  return {
    root: v[0]!,
    commitment: v[1]!,
    asset: v[2]!,
    minAmount: v[3]!,
    reveal: v[4]!,
    shownAmount: v[5]!,
    context: v[6]!,
  };
}

// ── payroll total ──────────────────────────────────────────────────────────

export type PayrollPaymentInput = {
  /** The payee note the payer created: its secret and amount. */
  secretHex: Hex;
  amount: bigint;
  /** The payer's own note that the transfer spent (its nullifier is public in Transferred). */
  spendSecretHex: Hex;
  spendAmount: bigint;
  /** What the payer recorded at send time; when given, the openings must match. */
  commitment?: Hex;
  nullifier?: Hex;
};

/** One payment as the verifier sees it: the payee note and the transfer's nullifier. */
export type PayrollPaymentPublic = { commitment: bigint; nullifier: bigint };

export type PayrollWitness = {
  circomInput: Record<string, string | string[]>;
  publicInputs: {
    asset: bigint;
    total: bigint;
    count: bigint;
    paymentsHash: bigint;
    context: bigint;
  };
  /** The plain list that travels with the proof, in slot order (used slots only). */
  payments: PayrollPaymentPublic[];
  /** The publicSignals a correct proof carries, in circuit order. */
  publicSignals: string[];
  blocker: string | null;
};

/**
 * The payroll circuit's list hash over all 32 slots, empty ones as (0, 0):
 * h0 = 0, h(i+1) = Poseidon(h(i), commitment(i), nullifier(i)). A verifier
 * recomputes it from the plain list in the proof and compares it with the
 * `paymentsHash` public signal.
 */
export async function payrollPaymentsHash(payments: readonly PayrollPaymentPublic[]): Promise<bigint> {
  if (payments.length > PAYROLL_PROOF_SLOTS) throw new Error("Too many payments for one proof.");
  let h = 0n;
  for (let i = 0; i < PAYROLL_PROOF_SLOTS; i++) {
    const p = payments[i];
    h = await poseidon3(h, p ? p.commitment : 0n, p ? p.nullifier : 0n);
  }
  return h;
}

/**
 * How a run of `n` payments splits into proofs: as few parts as fit, as even as
 * possible, so no part is a lone salary (each part shows its own subtotal).
 * 33 payments are 17 + 16, never 32 + 1.
 */
export function payrollParts(n: number): number[] {
  if (!Number.isSafeInteger(n) || n <= 0) return [];
  const parts = Math.ceil(n / PAYROLL_PROOF_SLOTS);
  const base = Math.floor(n / parts);
  const extra = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

export async function buildPayrollWitness(args: {
  asset: Address;
  context: bigint;
  payments: PayrollPaymentInput[];
}): Promise<PayrollWitness> {
  const assetField = toField(BigInt(args.asset));
  const n = args.payments.length;
  let blocker: string | null = null;
  if (n < 1 || n > PAYROLL_PROOF_SLOTS) {
    blocker = `A payroll total proof covers 1 to ${PAYROLL_PROOF_SLOTS} payments.`;
  }
  if (!blocker && (args.context < 0n || args.context >= FIELD_PRIME)) {
    blocker = "Bad proof context.";
  }

  const used: string[] = [];
  const secrets: string[] = [];
  const amounts: string[] = [];
  const commitments: string[] = [];
  const spendSecrets: string[] = [];
  const spendAmounts: string[] = [];
  const nullifiers: string[] = [];
  const payments: PayrollPaymentPublic[] = [];
  const seenC = new Set<bigint>();
  const seenN = new Set<bigint>();
  let total = 0n;

  for (const p of args.payments.slice(0, PAYROLL_PROOF_SLOTS)) {
    const secret = hexToField(p.secretHex);
    const spendSecret = hexToField(p.spendSecretHex);
    const commitment = await noteCommitmentPoseidon(secret, p.amount, args.asset);
    const spendCommitment = await noteCommitmentPoseidon(spendSecret, p.spendAmount, args.asset);
    const nullifier = await noteNullifierPoseidon(spendSecret, spendCommitment);
    if (!blocker && (secret === 0n || spendSecret === 0n)) {
      blocker = "A payment has no key on this device, so it cannot be proven.";
    }
    if (!blocker && (p.amount <= 0n || p.amount >= AMOUNT_LIMIT)) {
      blocker = "A payment amount is out of range.";
    }
    if (!blocker && (p.spendAmount < p.amount || p.spendAmount >= AMOUNT_LIMIT)) {
      blocker = "A payment is larger than the balance it was paid from.";
    }
    if (!blocker && p.commitment !== undefined && hexToField(p.commitment) !== commitment) {
      blocker = "A payment's key does not open its record (wrong note or asset).";
    }
    if (!blocker && p.nullifier !== undefined && hexToField(p.nullifier) !== nullifier) {
      blocker = "A payment's spent balance does not match its transaction.";
    }
    if (!blocker && (seenC.has(commitment) || seenN.has(nullifier))) {
      blocker = "The same payment is listed twice.";
    }
    seenC.add(commitment);
    seenN.add(nullifier);
    used.push("1");
    secrets.push(secret.toString());
    amounts.push(p.amount.toString());
    commitments.push(commitment.toString());
    spendSecrets.push(spendSecret.toString());
    spendAmounts.push(p.spendAmount.toString());
    nullifiers.push(nullifier.toString());
    payments.push({ commitment, nullifier });
    total += p.amount;
  }
  // Empty slots: everything 0 (the circuit pins amount, commitment and nullifier).
  while (used.length < PAYROLL_PROOF_SLOTS) {
    for (const col of [used, secrets, amounts, commitments, spendSecrets, spendAmounts, nullifiers]) col.push("0");
  }

  const count = BigInt(payments.length);
  const paymentsHash = await payrollPaymentsHash(payments);
  return {
    circomInput: {
      asset: assetField.toString(),
      total: total.toString(),
      count: count.toString(),
      paymentsHash: paymentsHash.toString(),
      context: args.context.toString(),
      used,
      secret: secrets,
      amount: amounts,
      commitment: commitments,
      spendSecret: spendSecrets,
      spendAmount: spendAmounts,
      nullifier: nullifiers,
    },
    publicInputs: { asset: assetField, total, count, paymentsHash, context: args.context },
    payments,
    publicSignals: [assetField, total, count, paymentsHash, args.context].map(String),
    blocker,
  };
}

/** Read a payroll total proof's public signals by name. */
export function readPayrollSignals(signals: readonly string[]) {
  if (signals.length !== PAYROLL_PUBLIC_SIGNALS.length) throw new Error("Wrong number of public signals.");
  const v = signals.map((s) => BigInt(s));
  return { asset: v[0]!, total: v[1]!, count: v[2]!, paymentsHash: v[3]!, context: v[4]! };
}
