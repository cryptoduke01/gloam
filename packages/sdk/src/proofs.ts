/**
 * Witness builders for the two holder proofs (contracts/circuits/solvency and
 * contracts/circuits/receipt). Pure like ./witness.ts: each returns the circom
 * input plus the public signals the proof must carry; proving is separate.
 *
 *   funds    "I hold at least `threshold` of `asset`" from 1 to 4 unspent notes.
 *            Public: [root, asset, threshold, context, nullifier0..3]
 *   receipt  "this note is a real payment of `asset`, worth `shownAmount` (or at
 *            least `minAmount`)". Public: [root, commitment, asset, minAmount,
 *            reveal, shownAmount, context]
 *
 * `context` ties a proof to one verifier, expiry, chain and pool (proofContext),
 * so a proof made for one party cannot be passed off as made for another.
 */

import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { FIELD_PRIME } from "./constants.js";
import { MERKLE_DEPTH, type PoseidonMerklePath } from "./merkle.js";
import { noteCommitmentPoseidon, noteNullifierPoseidon } from "./note.js";
import { hexToField, toField } from "./poseidon.js";

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

/** Notes are range checked to < 2^128 in every Gloam circuit (Kensho C2). */
const AMOUNT_LIMIT = 1n << 128n;

const CONTEXT_DOMAIN = "gloam.proof.v1";

export type ProofContextArgs = {
  kind: "funds" | "payment";
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
