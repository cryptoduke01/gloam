/**
 * Server-side checking of Gloam proofs for POST /api/v1/proofs/verify.
 *
 * Formats: gloamfunds1 (proof of funds), gloampay1 (proof of payment),
 * gloamroll1 (payroll total) and gloamdisc1 (the older balance disclosure).
 *
 * This reuses the checks the /verify page runs (lib/proofs), with one swap.
 * The page's snark step loads its checking key with a relative fetch, which
 * only works in a browser. So here:
 *  - payroll totals go through checkPayrollProof, whose snark step is
 *    injected, with the server's own key;
 *  - funds and payment proofs go through verifyProof unchanged; its snark step
 *    fails on the server, and its first check is replaced by the server's own
 *    Groth16 check. Every other check (sealed label and expiry, Gloam's own
 *    vault, fields match the signals, root known, notes unspent, payment
 *    landed, not expired) is the page's own. If the page's checks ever change
 *    shape, this fails closed;
 *  - balance disclosures follow the /verify page: snark, Gloam's vault, and
 *    the balance is in the vault.
 *
 * Checking keys are the same files as /public/circuits, bundled at build time
 * (scripts/selftest-partners.mts checks them against the pinned hashes).
 */
import { toHex } from "viem";
import { decodeDisclosure } from "@/lib/disclosure";
import { decodeProof, isGloamProof, verifyProof, type AnyProof, type VerifyResult } from "@/lib/proofs";
import { clientFor, commitmentSeen, findPayrollPayment, networkForChain } from "@/lib/proofs/chain";
import { checkPayrollProof } from "@/lib/proofs/payrollCheck";
import { ApiError } from "@/lib/partnersApi";
import fundsVkey from "../../../../../public/circuits/funds_vkey.json";
import receiptVkey from "../../../../../public/circuits/receipt_vkey.json";
import payrollVkey from "../../../../../public/circuits/payroll_total_vkey.json";
import shieldVkey from "../../../../../public/circuits/shield_vkey.json";

export const SNARK_CHECK = "The proof checks out";
/** The one check verifyProof lets stay "unknown" (lib/proofs/verify). */
const PAID_AT = "When the payment landed";

export type ProofFormat = "gloamfunds1" | "gloampay1" | "gloamroll1" | "gloamdisc1";

export type ApiVerifyResult = {
  format: ProofFormat;
  kind: "funds" | "payment" | "payroll" | "balance";
  ok: boolean;
  expired: boolean;
  checks: VerifyResult["checks"];
  /** Unix seconds the payment landed (proof of payment), when found. */
  paidAt: number | null;
  /** Unix seconds of the first and last payroll payment, when all were found. */
  paidBetween: [number, number] | null;
  /** The proof's plain fields, as the holder shared them. */
  claims: Record<string, unknown>;
};

type Snarkjs = typeof import("snarkjs") & {
  curves?: { getCurveFromName(name: string, opts?: { singleThread?: boolean }): Promise<unknown> };
};

/**
 * snarkjs with a single-threaded curve. groth16.verify reuses a curve cached
 * on globalThis; seeding it single-threaded keeps a serverless function from
 * spawning worker threads it never cleans up.
 */
async function snark(): Promise<Snarkjs> {
  const snarkjs = (await import("snarkjs")) as Snarkjs;
  const g = globalThis as { curve_bn128?: unknown };
  if (!g.curve_bn128 && snarkjs.curves) {
    g.curve_bn128 = await snarkjs.curves.getCurveFromName("bn128", { singleThread: true });
  }
  return snarkjs;
}

export async function groth16Verify(vkey: unknown, signals: unknown, proof: unknown): Promise<boolean> {
  if (!Array.isArray(signals) || !signals.every((s) => typeof s === "string" && /^\d{1,78}$/.test(s))) return false;
  if (!proof || typeof proof !== "object") return false;
  try {
    return await (await snark()).groth16.verify(vkey, signals as string[], proof);
  } catch {
    return false;
  }
}

function when(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function claimsOf(p: AnyProof): Record<string, unknown> {
  const base = { chainId: p.chainId, pool: p.pool, verifier: p.verifier, expiresAt: p.expiresAt, asset: p.asset };
  if (p.kind === "funds") return { ...base, threshold: p.threshold };
  if (p.kind === "payment") return { ...base, amount: p.amount, minAmount: p.minAmount, commitment: p.commitment, txHash: p.txHash };
  return { ...base, total: p.total, count: p.count };
}

const FORMAT: Record<AnyProof["kind"], ProofFormat> = {
  funds: "gloamfunds1",
  payment: "gloampay1",
  payroll: "gloamroll1",
};

async function verifyPayrollServer(p: Extract<AnyProof, { kind: "payroll" }>): Promise<VerifyResult> {
  const net = networkForChain(p.chainId);
  const official = Boolean(net?.pool && typeof p.pool === "string" && net.pool.toLowerCase() === p.pool.toLowerCase());
  const client = net ? clientFor(net) : null;
  const blockTimes = new Map<bigint, Promise<number>>();
  return checkPayrollProof(p, {
    verifySnark: (part) => groth16Verify(payrollVkey, part.publicSignals, part.proof),
    vault: official && net ? { label: net.label } : null,
    findPayment: (x) => findPayrollPayment(client!, net!, net!.pool!, x, blockTimes),
    now: Math.floor(Date.now() / 1000),
    when,
  });
}

async function verifyHolderServer(p: Extract<AnyProof, { kind: "funds" | "payment" }>): Promise<VerifyResult> {
  const page = await verifyProof(p);
  const first = page.checks[0];
  // The page bails out before its snark step when the signals are damaged:
  // that verdict stands as it is.
  if (page.checks.length === 1) return { ...page, ok: false };
  if (!first || first.label !== SNARK_CHECK) {
    return {
      ...page,
      ok: false,
      checks: [{ label: SNARK_CHECK, state: "fail", detail: "This proof could not be checked here." }, ...page.checks],
    };
  }
  const valid = await groth16Verify(p.kind === "funds" ? fundsVkey : receiptVkey, p.publicSignals, p.proof);
  const checks = [
    {
      label: SNARK_CHECK,
      state: valid ? ("pass" as const) : ("fail" as const),
      detail: valid
        ? "Verified with Gloam's zero-knowledge checking key."
        : "The math does not hold. It was edited or made for a different circuit.",
    },
    ...page.checks.slice(1),
  ];
  const ok = !page.expired && checks.every((c) => c.state === "pass" || (c.label === PAID_AT && c.state === "unknown"));
  return { ...page, checks, ok };
}

async function verifyDisclosureServer(text: string): Promise<ApiVerifyResult> {
  let d: ReturnType<typeof decodeDisclosure>;
  try {
    d = decodeDisclosure(text);
  } catch {
    throw new ApiError(400, "invalid_proof", "That is not a Gloam proof.");
  }
  const checks: VerifyResult["checks"] = [];
  const valid = await groth16Verify(shieldVkey, [d.commitment, d.amount, d.asset].map(String), d.proof);
  checks.push({
    label: SNARK_CHECK,
    state: valid ? "pass" : "fail",
    detail: valid ? "Verified with Gloam's zero-knowledge checking key." : "The proof did not verify.",
  });
  const net = networkForChain(Number(d.chainId));
  const official = Boolean(net?.pool && typeof d.pool === "string" && net.pool.toLowerCase() === d.pool.toLowerCase());
  checks.push({
    label: official ? `Made on Gloam's vault on ${net!.label}` : "Made on Gloam's vault",
    state: official ? "pass" : "fail",
    detail: official ? undefined : "The vault address is not Gloam's current vault, so its balance cannot be trusted.",
  });
  if (official && net?.pool) {
    let seen: boolean | null = null;
    try {
      seen = await commitmentSeen(clientFor(net), net.pool, toHex(BigInt(d.commitment), { size: 32 }));
    } catch {
      seen = null;
    }
    checks.push({
      label: "Balance is in the vault",
      state: seen == null ? "unknown" : seen ? "pass" : "fail",
      detail: seen == null ? `Could not reach ${net.label}. Try again.` : seen ? undefined : "The vault has no record of this balance.",
    });
  }
  return {
    format: "gloamdisc1",
    kind: "balance",
    ok: checks.every((c) => c.state === "pass"),
    expired: false,
    checks,
    paidAt: null,
    paidBetween: null,
    claims: { chainId: d.chainId, pool: d.pool, asset: d.asset, amount: d.amount, commitment: d.commitment },
  };
}

/** Checks any Gloam proof text. Malformed input is a 400 ApiError. */
export async function verifyProofText(raw: unknown): Promise<ApiVerifyResult> {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ApiError(400, "invalid_proof", 'Send the proof text as { "proof": "gloamfunds1:..." }.');
  }
  if (raw.length > 400_000) throw new ApiError(413, "too_large", "That proof is too large.");
  const text = raw.trim();
  if (!isGloamProof(text)) return verifyDisclosureServer(text);

  let p: AnyProof;
  try {
    p = decodeProof(text);
  } catch (e) {
    throw new ApiError(400, "invalid_proof", e instanceof Error ? e.message : "That is not a Gloam proof.");
  }
  const r = p.kind === "payroll" ? await verifyPayrollServer(p) : await verifyHolderServer(p);
  return {
    format: FORMAT[p.kind],
    kind: p.kind,
    ok: r.ok,
    expired: r.expired,
    checks: r.checks,
    paidAt: r.paidAt ?? null,
    paidBetween: r.paidBetween ?? null,
    claims: claimsOf(p),
  };
}
