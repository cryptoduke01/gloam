/**
 * Proof of funds ("I hold at least X of this asset") and proof of payment ("a
 * private payment of X was made into a note whose key I hold"), made in node
 * and checked in node. The proofs are the same text the Gloam app makes and
 * reads (gloamfunds1:… and gloampay1:…, app/src/lib/proofs), so one made here
 * opens at gloam.trade/verify, and one made in the app checks out here.
 *
 * Each proof is made for one named reader and an expiry, sealed into its
 * `context` signal (proofContext in the SDK), so a proof forwarded to someone
 * else shows who it was really for.
 *
 * What they do not show: a proof of funds hides the balance and which notes
 * back it. A proof of payment shows the payment exists and its amount (or a
 * minimum), not who paid whom: the payer picks the payee note's key, so the
 * payer can make the same proof.
 */
import {
  FIELD_PRIME,
  buildFundsWitness,
  buildReceiptWitness,
  ceremonyForChainId,
  fieldToHex,
  networkForChainId,
  networkName,
  proofContext,
  readFundsSignals,
  readReceiptSignals,
  type PoseidonMerklePath,
} from "@gloamtrade/sdk";
import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { verificationKey, type Artifacts } from "./artifacts.js";

export const FUNDS_PREFIX = "gloamfunds1:";
export const PAYMENT_PREFIX = "gloampay1:";
const OTHER_PREFIXES = ["gloamroll1:", "gloambal1:", "gloamdisc1:"];

/** Longest reader label a proof can carry (as in the app). */
export const MAX_LABEL = 80;
const HIDDEN = /[\p{Cf}\u0000-\u0008\u000E-\u001F\u007F-\u009F]/gu;
const DEFAULT_TTL_S = 7 * 24 * 3600;

/** The label exactly as it is sealed in: hidden characters removed, trimmed, single spaced. */
export function cleanVerifierLabel(label: string): string {
  const v = String(label ?? "").replace(HIDDEN, "").replace(/\s+/g, " ").trim();
  if (!v) throw new Error("Say who this proof is for.");
  if (Array.from(v).length > MAX_LABEL) throw new Error(`Keep the name under ${MAX_LABEL} characters.`);
  return v;
}

type ProofBase = {
  v: 1;
  chainId: number;
  pool: Address;
  verifier: string;
  expiresAt: number;
  proof: unknown;
  publicSignals: string[];
};

export type FundsProof = ProofBase & { kind: "funds"; asset: Address; threshold: string; root: Hex; nullifiers: Hex[] };
export type PaymentProof = ProofBase & {
  kind: "payment";
  asset: Address;
  commitment: Hex;
  amount: string | null;
  minAmount: string;
  txHash: Hex | null;
};
export type HolderProof = FundsProof | PaymentProof;

function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

export function encodeProof(p: HolderProof): string {
  return (p.kind === "funds" ? FUNDS_PREFIX : PAYMENT_PREFIX) + toBase64(JSON.stringify(p));
}

const isStr = (v: unknown): v is string => typeof v === "string";

export function decodeProof(text: string): HolderProof {
  const t = String(text ?? "").trim();
  const kind = t.startsWith(FUNDS_PREFIX) ? "funds" : t.startsWith(PAYMENT_PREFIX) ? "payment" : null;
  if (!kind) {
    if (OTHER_PREFIXES.some((x) => t.startsWith(x))) {
      throw new Error("This is a payroll, balance or older disclosure proof. Check it at gloam.trade/verify.");
    }
    throw new Error("Not a Gloam proof.");
  }
  let p: HolderProof;
  try {
    p = JSON.parse(Buffer.from(t.slice(kind === "funds" ? FUNDS_PREFIX.length : PAYMENT_PREFIX.length).replace(/\s+/g, ""), "base64").toString("utf8"));
  } catch {
    throw new Error("This proof is damaged. Ask for it again.");
  }
  const base =
    p &&
    p.v === 1 &&
    p.kind === kind &&
    Number.isSafeInteger(p.chainId) &&
    isStr(p.pool) &&
    isStr(p.verifier) &&
    Number.isSafeInteger(p.expiresAt) &&
    isStr(p.asset) &&
    typeof p.proof === "object" &&
    p.proof !== null &&
    Array.isArray(p.publicSignals) &&
    p.publicSignals.every(isStr);
  const shaped =
    base &&
    (p.kind === "funds"
      ? isStr(p.threshold) && isStr(p.root) && Array.isArray(p.nullifiers) && p.nullifiers.every(isStr)
      : isStr(p.commitment) && isStr(p.minAmount) && (p.amount === null || isStr(p.amount)) && (p.txHash === null || isStr(p.txHash)));
  if (!shaped) throw new Error("This proof is damaged. Ask for it again.");
  return p;
}

function expiryOf(expiresAt: number | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  const at = expiresAt ?? now + DEFAULT_TTL_S;
  if (!Number.isSafeInteger(at) || at <= now) throw new Error("Pick an expiry in the future.");
  return at;
}

async function prove(artifacts: Artifacts, circuit: "funds" | "receipt", chainId: number, input: Record<string, unknown>, expected: string[]) {
  const { wasm, zkey } = await artifacts.paths(circuit, ceremonyForChainId(chainId));
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input as never, wasm, zkey);
  if (publicSignals.length !== expected.length || publicSignals.some((s: string, i: number) => s !== expected[i])) {
    throw new Error("The proof did not come out as expected.");
  }
  return { proof: proof as unknown, publicSignals: publicSignals as string[] };
}

export async function proveFunds(args: {
  artifacts: Artifacts;
  chainId: number;
  pool: Address;
  asset: Address;
  threshold: bigint;
  /** 1 to 4 unspent notes of the asset, with paths from one tree snapshot. */
  notes: { secret: Hex; amount: bigint; path: PoseidonMerklePath }[];
  verifier: string;
  expiresAt?: number;
}): Promise<FundsProof> {
  const verifier = cleanVerifierLabel(args.verifier);
  const expiresAt = expiryOf(args.expiresAt);
  if (args.threshold <= 0n) throw new Error("Prove an amount above zero.");
  const context = proofContext({ kind: "funds", chainId: args.chainId, pool: args.pool, verifier, expiresAt });
  const w = await buildFundsWitness({
    asset: args.asset,
    threshold: args.threshold,
    context,
    notes: args.notes.map((n) => ({ secretHex: n.secret, amount: n.amount, path: n.path })),
  });
  if (w.blocker) throw new Error(w.blocker);
  const { proof, publicSignals } = await prove(args.artifacts, "funds", args.chainId, w.circomInput, w.publicSignals);
  return {
    v: 1,
    kind: "funds",
    chainId: args.chainId,
    pool: args.pool,
    verifier,
    expiresAt,
    asset: args.asset,
    threshold: args.threshold.toString(),
    root: fieldToHex(w.publicInputs.root),
    nullifiers: w.publicInputs.nullifiers.filter((n) => n !== 0n).map(fieldToHex),
    proof,
    publicSignals,
  };
}

export async function provePayment(args: {
  artifacts: Artifacts;
  chainId: number;
  pool: Address;
  /** The payment note (its key is known to the payer) and where it sits in the tree. */
  note: { secret: Hex; amount: bigint; asset: Address; path: PoseidonMerklePath };
  /** The transaction that made the payment, so a reader can confirm it was a private send. */
  txHash: Hex | null;
  /** Show the exact amount (true) or only a minimum. */
  reveal: boolean;
  minAmount?: bigint;
  verifier: string;
  expiresAt?: number;
}): Promise<PaymentProof> {
  const verifier = cleanVerifierLabel(args.verifier);
  const expiresAt = expiryOf(args.expiresAt);
  const amount = args.note.amount;
  const minAmount = args.reveal ? amount : (args.minAmount ?? amount);
  if (minAmount < 0n || minAmount > amount) throw new Error("The minimum must be between zero and the payment.");
  const context = proofContext({ kind: "payment", chainId: args.chainId, pool: args.pool, verifier, expiresAt });
  const w = await buildReceiptWitness({
    secretHex: args.note.secret,
    amount,
    asset: args.note.asset,
    path: args.note.path,
    reveal: args.reveal,
    minAmount,
    context,
  });
  if (w.blocker) throw new Error(w.blocker);
  const { proof, publicSignals } = await prove(args.artifacts, "receipt", args.chainId, w.circomInput, w.publicSignals);
  return {
    v: 1,
    kind: "payment",
    chainId: args.chainId,
    pool: args.pool,
    verifier,
    expiresAt,
    asset: args.note.asset,
    amount: args.reveal ? amount.toString() : null,
    minAmount: minAmount.toString(),
    commitment: fieldToHex(w.publicInputs.commitment),
    txHash: args.txHash,
    proof,
    publicSignals,
  };
}

// ------------------------------------------------------------------ checking

export type CheckState = "pass" | "fail" | "unknown";
export type ProofCheck = { label: string; state: CheckState; detail?: string };
export type ProofReport = {
  ok: boolean;
  kind: "funds" | "payment";
  expired: boolean;
  network: string | null;
  testnet: boolean | null;
  /** What the proof claims, in plain units of the asset's base units. */
  claims: Record<string, unknown>;
  checks: ProofCheck[];
};

const POOL_READS = [
  { type: "function", name: "isKnownRoot", stateMutability: "view", inputs: [{ name: "root", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isSpent", stateMutability: "view", inputs: [{ name: "nullifier", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "commitmentSeen", stateMutability: "view", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

const NOTE_EVENTS = [
  {
    type: "event",
    name: "Shielded",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "leafIndex", type: "uint256", indexed: false },
      { name: "from", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Transferred",
    inputs: [
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "newCommitments", type: "bytes32[2]", indexed: false },
    ],
  },
] as const;

function fieldSignals(signals: unknown): string[] | null {
  if (!Array.isArray(signals)) return null;
  for (const s of signals) if (typeof s !== "string" || !/^\d{1,78}$/.test(s) || BigInt(s) >= FIELD_PRIME) return null;
  return signals as string[];
}

function sameHex(a: string, b: bigint): boolean {
  try {
    return BigInt(a) === b;
  } catch {
    return false;
  }
}

/**
 * Every check gloam.trade/verify runs for these two kinds, in the same order:
 * the zero-knowledge proof, who it was made for, that it names Gloam's own
 * vault, that the fields shown match the proof, then the chain (the vault had
 * that state; the notes are unspent, or the payment is the payment side of a
 * private send), and the expiry. `client` must read the chain the proof names.
 * ok is true only when every check passed and the proof has not expired.
 */
export async function verifyHolderProof(p: HolderProof, client: PublicClient): Promise<ProofReport> {
  const checks: ProofCheck[] = [];
  const add = (label: string, state: CheckState, detail?: string) => checks.push({ label, state, detail });
  const expired = !(Number.isSafeInteger(p.expiresAt) && Math.floor(Date.now() / 1000) <= p.expiresAt);
  const net = networkForChainId(Number(p.chainId));
  const claims: Record<string, unknown> =
    p.kind === "funds"
      ? { asset: p.asset, atLeast: p.threshold, for: p.verifier, expiresAt: p.expiresAt }
      : { asset: p.asset, amount: p.amount, atLeast: p.minAmount, for: p.verifier, expiresAt: p.expiresAt, txHash: p.txHash };
  const finish = (): ProofReport => ({
    ok: !expired && checks.length > 0 && checks.every((c) => c.state === "pass"),
    kind: p.kind,
    expired,
    network: net ? networkName(net.chainId) : null,
    testnet: net ? net.testnet : null,
    claims,
    checks,
  });
  const expiry = () => add(expired ? "Expired" : "Not expired", expired ? "fail" : "pass", `Valid until ${new Date(p.expiresAt * 1000).toISOString()}.`);

  const signals = fieldSignals(p.publicSignals);
  let funds: ReturnType<typeof readFundsSignals> | null = null;
  let receipt: ReturnType<typeof readReceiptSignals> | null = null;
  try {
    if (signals && p.kind === "funds") funds = readFundsSignals(signals);
    if (signals && p.kind === "payment") receipt = readReceiptSignals(signals);
  } catch {
    /* wrong signal count, reported below */
  }
  if (!signals || (!funds && !receipt)) {
    add("The proof checks out", "fail", "This proof is damaged or incomplete.");
    return finish();
  }

  // 1) The zero-knowledge proof.
  let valid = false;
  try {
    const snarkjs = await import("snarkjs");
    valid = await snarkjs.groth16.verify(verificationKey(funds ? "funds" : "receipt", ceremonyForChainId(Number(p.chainId))) as never, signals, p.proof as never);
  } catch {
    valid = false;
  }
  add("The proof checks out", valid ? "pass" : "fail", valid ? "Verified with Gloam's checking key for that network." : "The math does not hold.");

  // 2) Who it was made for: label, expiry, chain and pool are sealed into context.
  let sealed = false;
  try {
    const context = (funds ?? receipt)!.context;
    sealed = proofContext({ kind: p.kind, chainId: p.chainId, pool: p.pool, verifier: p.verifier, expiresAt: p.expiresAt }) === context;
  } catch {
    sealed = false;
  }
  add(`Made for "${p.verifier}"`, sealed ? "pass" : "fail", sealed ? "The name, expiry and network are sealed into the proof." : "The name, expiry or network was changed after the proof was made.");

  // 3) Gloam's own vault on that network.
  const official = Boolean(net && net.pool.toLowerCase() === String(p.pool).toLowerCase());
  add(
    official ? `Made on Gloam's vault on ${networkName(net!.chainId)}` : "Made on Gloam's vault",
    official ? "pass" : "fail",
    official ? undefined : "The vault address is not Gloam's vault on that network."
  );

  // 4) The fields shown match the signals.
  let fieldsMatch = false;
  if (p.kind === "funds" && funds) {
    const used = funds.nullifiers.filter((n) => n !== 0n);
    fieldsMatch =
      sameHex(p.asset, funds.asset) &&
      /^\d+$/.test(p.threshold) &&
      BigInt(p.threshold) === funds.threshold &&
      funds.threshold > 0n &&
      sameHex(p.root, funds.root) &&
      p.nullifiers.length === used.length &&
      p.nullifiers.every((n, i) => sameHex(n, used[i]!));
  } else if (p.kind === "payment" && receipt) {
    const shown = p.amount != null;
    fieldsMatch =
      sameHex(p.asset, receipt.asset) &&
      sameHex(p.commitment, receipt.commitment) &&
      /^\d+$/.test(p.minAmount) &&
      BigInt(p.minAmount) === receipt.minAmount &&
      receipt.reveal === (shown ? 1n : 0n) &&
      (shown ? /^\d+$/.test(p.amount!) && BigInt(p.amount!) === receipt.shownAmount : receipt.shownAmount === 0n) &&
      (p.txHash == null || /^0x[0-9a-fA-F]{64}$/.test(p.txHash));
  }
  add("Asset and amount match the proof", fieldsMatch ? "pass" : "fail", fieldsMatch ? undefined : "The asset or amount shown was changed after the proof was made.");

  if (!valid || !sealed || !official || !fieldsMatch || !net) {
    expiry();
    return finish();
  }

  // 5) The chain.
  const pool = net.pool;
  const offline = `Could not reach ${networkName(net.chainId)}. Try again.`;
  const read = <T>(fn: "isKnownRoot" | "isSpent" | "commitmentSeen", arg: Hex) =>
    client.readContract({ address: pool, abi: POOL_READS, functionName: fn, args: [arg] }) as Promise<T>;
  const root = fieldToHex((funds ?? receipt)!.root);
  const rootKnown = await read<boolean>("isKnownRoot", root).catch(() => null);
  add("Matches a real vault state", rootKnown == null ? "unknown" : rootKnown ? "pass" : "fail", rootKnown == null ? offline : rootKnown ? undefined : "The vault never had the state this proof was made against.");

  if (funds) {
    const used = funds.nullifiers.filter((n) => n !== 0n);
    if (new Set(used).size !== used.length) {
      add("No balance counted twice", "fail", "The same note was counted more than once.");
    } else {
      add("No balance counted twice", "pass", `Backed by ${used.length} separate ${used.length === 1 ? "note" : "notes"}.`);
      const spent = await Promise.all(used.map((n) => read<boolean>("isSpent", fieldToHex(n)))).catch(() => null);
      const anySpent = spent?.some(Boolean);
      add(
        "Balance is still unspent",
        spent == null ? "unknown" : anySpent ? "fail" : "pass",
        spent == null ? offline : anySpent ? "Some of this balance has moved since the proof was made." : "None of the backing notes has moved since."
      );
    }
  } else if (p.kind === "payment") {
    const commitment = fieldToHex(receipt!.commitment);
    const seen = await read<boolean>("commitmentSeen", commitment).catch(() => null);
    add("Payment is in the vault", seen == null ? "unknown" : seen ? "pass" : "fail", seen == null ? offline : seen ? undefined : "The vault has no record of this payment.");
    if (seen !== false) add(...(await paidBySend(client, pool, commitment, p.txHash, offline)));
  }

  expiry();
  return finish();
}

/** The payment note must be the payment side of a private send (Transferred newCommitments[0]), not change or a deposit. */
async function paidBySend(client: PublicClient, pool: Address, commitment: Hex, txHash: Hex | null, offline: string): Promise<[string, CheckState, string]> {
  const label = "Made by a private payment";
  if (!txHash) return [label, "unknown", "The proof does not name the transaction that made this payment. Ask for a new proof."];
  let receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (e) {
    if (e instanceof Error && e.name === "TransactionReceiptNotFoundError") return [label, "fail", "The transaction named in the proof is not on this network."];
    return [label, "unknown", offline];
  }
  if (receipt.status !== "success") return [label, "fail", "The transaction named in the proof did not make this payment."];
  const want = commitment.toLowerCase();
  const logs = parseEventLogs({ abi: NOTE_EVENTS, logs: receipt.logs }) as unknown as { eventName: string; address: Address; args: Record<string, unknown> }[];
  for (const l of logs) {
    if (l.address.toLowerCase() !== pool.toLowerCase()) continue;
    if (l.eventName === "Transferred") {
      const out = (l.args.newCommitments as readonly Hex[]) ?? [];
      if (out[0]?.toLowerCase() === want) {
        const block = await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
        return [label, "pass", `${block ? new Date(Number(block.timestamp) * 1000).toISOString() : "Confirmed"}. The payment side of a private send.`];
      }
      if (out[1]?.toLowerCase() === want) return [label, "fail", "This note is the change a sender kept from their own send, not a payment."];
    }
    if (l.eventName === "Shielded" && String(l.args.commitment).toLowerCase() === want) {
      return [label, "fail", "This note came from a deposit into the vault, not a payment."];
    }
  }
  return [label, "fail", "The transaction named in the proof did not make this payment."];
}
