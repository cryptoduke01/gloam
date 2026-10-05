/**
 * Checking a payroll total proof, kept free of app wiring (network clients,
 * artifacts, demo switch) so node tests can run it with real snarks and a
 * pretend chain. verify.ts passes the real dependencies.
 *
 * What a pass means, check by check:
 *   1. every part's Groth16 proof holds against the payroll_total key
 *   2. every part was sealed for this label, expiry, chain and vault
 *   3. the vault is Gloam's own on that chain
 *   4. the plain total, count and payment list are exactly what was proven
 *      (each part's list rehashes to its paymentsHash signal)
 *   5. no payment appears twice, across all parts
 *   6. every payment is the first output of a private transfer in that vault
 *      whose spend marker is the one proven: a payment the prover made, not a
 *      deposit, a trade, change, or someone else's payment to them
 *   7. when the first and last payment landed
 *   8. not expired
 */
import {
  FIELD_PRIME,
  PAYROLL_PROOF_SLOTS,
  payrollPaymentsHash,
  proofContext,
  readPayrollSignals,
} from "@gloamtrade/sdk";
import type { Hex } from "viem";
import type { CheckState, PayrollPayment, PayrollProof, PayrollProofPart, VerifyResult } from "./types";

/** How one payment was found on chain. */
export type PaymentLookup =
  | { state: "found"; txHash: Hex; paidAt: number }
  /** The note exists, but a deposit or a private trade made it, not a payment. */
  | { state: "wrong-origin"; origin: "deposit" | "trade" }
  /** The transfer exists, but this note is its change, which went back to the sender. */
  | { state: "change" }
  /** The named transaction does not pair this note with this spend marker. */
  | { state: "mismatch" }
  /** Not in the named transaction's chain, or older than the bounded scan. */
  | { state: "not-found" };

/** A decoded pool event, as viem's parseEventLogs returns it. */
export type PoolEventLog = { eventName: string; address: string; args: Record<string, unknown> };

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

/**
 * What a successful transaction's pool events say about one payroll payment:
 * it must hold Transferred(nullifier, [commitment, change]) from this pool.
 */
export function classifyPaymentLogs(
  logs: readonly PoolEventLog[],
  pool: string,
  commitment: string,
  nullifier: string
): "found" | "change" | "deposit" | "trade" | "mismatch" {
  const c = commitment.toLowerCase();
  const n = nullifier.toLowerCase();
  const ours = logs.filter((l) => lower(l.address) === pool.toLowerCase());
  for (const l of ours) {
    if (l.eventName !== "Transferred" || lower(l.args.nullifier) !== n) continue;
    const out = Array.isArray(l.args.newCommitments) ? l.args.newCommitments.map(lower) : [];
    if (out[0] === c) return "found";
    if (out[1] === c) return "change";
  }
  for (const l of ours) {
    if (l.eventName === "Shielded" && lower(l.args.commitment) === c) return "deposit";
    if (l.eventName === "SealedSwapped" && (lower(l.args.newCommitmentOut) === c || lower(l.args.newCommitmentChange) === c)) {
      return "trade";
    }
  }
  return "mismatch";
}

export type PayrollCheckDeps = {
  /** Groth16 check of one part against the payroll_total key. */
  verifySnark: (part: PayrollProofPart) => Promise<boolean>;
  /** Gloam's network for the proof's chain, when the proof's vault is Gloam's own; else null. */
  vault: { label: string } | null;
  /** Looks one payment up on chain; throws when the network cannot be reached. */
  findPayment: (pay: PayrollPayment) => Promise<PaymentLookup>;
  /** Unix seconds, for expiry. */
  now: number;
  /** How a time reads on the page. */
  when: (unix: number) => string;
};

const LOOKUP_PARALLEL = 6;

function sameHex(a: unknown, b: bigint): boolean {
  try {
    return typeof a === "string" && BigInt(a) === b;
  } catch {
    return false;
  }
}

/** A 0x field element below p, or null. */
function fieldOf(v: unknown): bigint | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(v)) return null;
  const x = BigInt(v);
  return x < FIELD_PRIME ? x : null;
}

function signalsOf(part: PayrollProofPart): ReturnType<typeof readPayrollSignals> | null {
  const s = part?.publicSignals;
  if (!Array.isArray(s) || !s.every((x) => typeof x === "string" && /^\d{1,78}$/.test(x) && BigInt(x) < FIELD_PRIME)) {
    return null;
  }
  try {
    return readPayrollSignals(s);
  } catch {
    return null;
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function checkPayrollProof(p: PayrollProof, deps: PayrollCheckDeps): Promise<VerifyResult> {
  const checks: VerifyResult["checks"] = [];
  const add = (label: string, state: CheckState, detail?: string) => checks.push({ label, state, detail });
  const expired = !(Number.isSafeInteger(p.expiresAt) && deps.now <= p.expiresAt);
  let paidBetween: [number, number] | undefined;
  const finish = (): VerifyResult => ({
    ok: !expired && checks.every((c) => c.state === "pass"),
    kind: "payroll",
    checks,
    paidBetween,
    expired,
  });
  const expiry = () => add(expired ? "Expired" : "Not expired", expired ? "fail" : "pass", `Valid until ${deps.when(p.expiresAt)}.`);

  const parts = Array.isArray(p.parts) ? p.parts : [];
  const signals = parts.map(signalsOf);
  if (parts.length === 0 || signals.some((s) => s === null)) {
    add("The proof checks out", "fail", "This proof is damaged or incomplete.");
    return finish();
  }
  const sig = signals as NonNullable<(typeof signals)[number]>[];

  // 1) The zero-knowledge proofs, one per part.
  const valid = (await Promise.all(parts.map((part) => deps.verifySnark(part).catch(() => false)))).every(Boolean);
  add(
    "The proof checks out",
    valid ? "pass" : "fail",
    valid
      ? parts.length === 1
        ? "Verified with Gloam's zero-knowledge checking key."
        : `All ${parts.length} parts verified with Gloam's zero-knowledge checking key.`
      : "The math does not hold. It was edited or made for a different circuit."
  );

  // 2) Who it was made for (label, expiry, chain, vault are sealed into each part's context).
  let sealed = false;
  try {
    const context = proofContext({
      kind: "payroll",
      chainId: p.chainId,
      pool: p.pool,
      verifier: p.verifier,
      expiresAt: p.expiresAt,
    });
    sealed = typeof p.verifier === "string" && sig.every((s) => s.context === context);
  } catch {
    sealed = false;
  }
  add(
    `Made for "${String(p.verifier)}"`,
    sealed ? "pass" : "fail",
    sealed
      ? "The name, expiry and network are sealed into the proof."
      : "The name, expiry or network was changed after the proof was made."
  );

  // 3) Gloam's own vault, or the chain checks below mean nothing.
  add(
    deps.vault ? `Made on Gloam's vault on ${deps.vault.label}` : "Made on Gloam's vault",
    deps.vault ? "pass" : "fail",
    deps.vault ? undefined : "The vault address is not Gloam's current vault, so its payments cannot be trusted."
  );

  // 4) The plain total, count and list are exactly what the parts prove.
  const payments = Array.isArray(p.payments) ? p.payments : [];
  const pairs = payments.map((x) => ({ commitment: fieldOf(x?.commitment), nullifier: fieldOf(x?.nullifier) }));
  const listOk = pairs.every((x) => x.commitment !== null && x.commitment !== 0n && x.nullifier !== null && x.nullifier !== 0n);
  let fieldsMatch =
    listOk &&
    Number.isSafeInteger(p.count) &&
    p.count === payments.length &&
    /^\d+$/.test(String(p.total)) &&
    sig.every((s) => sameHex(p.asset, s.asset) && s.count >= 1n && s.count <= BigInt(PAYROLL_PROOF_SLOTS)) &&
    sig.reduce((n, s) => n + s.count, 0n) === BigInt(payments.length) &&
    sig.reduce((t, s) => t + s.total, 0n) === BigInt(String(p.total || "0")) &&
    BigInt(String(p.total || "0")) > 0n;
  if (fieldsMatch) {
    let offset = 0;
    for (const s of sig) {
      const slice = pairs.slice(offset, offset + Number(s.count)) as { commitment: bigint; nullifier: bigint }[];
      offset += Number(s.count);
      if ((await payrollPaymentsHash(slice)) !== s.paymentsHash) {
        fieldsMatch = false;
        break;
      }
    }
  }
  add(
    "Total and people match the proof",
    fieldsMatch ? "pass" : "fail",
    fieldsMatch ? undefined : "The total, the number of people or the list of payments was changed after the proof was made."
  );

  // 5) No payment counted twice, across parts too (each part only sees its own).
  const cs = new Set(pairs.map((x) => x.commitment));
  const ns = new Set(pairs.map((x) => x.nullifier));
  const distinct = listOk && cs.size === pairs.length && ns.size === pairs.length;
  add(
    "No payment counted twice",
    distinct ? "pass" : "fail",
    distinct
      ? `${payments.length} separate ${payments.length === 1 ? "payment" : "payments"}.`
      : "The same payment is listed more than once."
  );

  if (!deps.vault || !listOk) {
    expiry();
    return finish();
  }

  // 6) Every payment is a private payment the prover made, in that vault.
  const looked = await inBatches(payments, LOOKUP_PARALLEL, (x) => deps.findPayment(x).catch(() => null));
  const offline = looked.some((r) => r === null);
  const bad = looked.find((r) => r && r.state !== "found" && r.state !== "not-found");
  const missing = looked.filter((r) => r?.state === "not-found").length;
  if (bad) {
    add(
      "Each one is a private payment in the vault",
      "fail",
      bad.state === "wrong-origin"
        ? bad.origin === "deposit"
          ? "One of these is a deposit into the vault, not a payment."
          : "One of these came out of a private trade, not a payment."
        : bad.state === "change"
          ? "One of these is change that went back to the sender, not a payment."
          : "A transaction named in the proof did not make that payment."
    );
  } else if (offline || missing > 0) {
    add(
      "Each one is a private payment in the vault",
      "unknown",
      offline
        ? "Could not reach the network to find every payment. Try again."
        : `${missing} of ${payments.length} could not be found on this network.`
    );
  } else {
    add(
      "Each one is a private payment in the vault",
      "pass",
      "Each was paid privately inside the vault, out of the prover's own balance."
    );
    // 7) When they landed.
    const times = (looked as { paidAt: number }[]).map((r) => r.paidAt);
    const first = Math.min(...times);
    const last = Math.max(...times);
    paidBetween = [first, last];
    add(
      "When the payments landed",
      "pass",
      last - first < 60 ? `${deps.when(first)}.` : `Between ${deps.when(first)} and ${deps.when(last)}.`
    );
  }

  // 8) Expiry.
  expiry();
  return finish();
}
