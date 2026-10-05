/**
 * Gloam proofs: proof of funds ("I hold at least X"), proof of payment, and the
 * payroll total ("this run paid exactly X to N people").
 *
 *   proveFunds / provePayment / provePayrollTotal   browser provers (./prove), dev Groth16 keys
 *   verifyProof                                     snark + context + on-chain checks (./verify)
 *   encodeProof / decodeProof                       the shareable text form (prefix + base64 JSON)
 *
 * Circuits: contracts/circuits/solvency (funds), contracts/circuits/receipt
 * (payment) and contracts/circuits/payroll_total (payroll). Witnesses:
 * buildFundsWitness / buildReceiptWitness / buildPayrollWitness in @gloamtrade/sdk.
 * Demo mode (lib/demoFlag) returns pretend proofs that only a demo tab accepts.
 */
import type { AnyProof, ProofKind } from "./types";

export * from "./types";
export { proveFunds, provePayment, provePayrollTotal, cleanVerifierLabel } from "./prove";
export { verifyProof } from "./verify";

export const FUNDS_PREFIX = "gloamfunds1:";
export const PAYMENT_PREFIX = "gloampay1:";
export const PAYROLL_PREFIX = "gloamroll1:";

const PREFIXES: Record<ProofKind, string> = {
  funds: FUNDS_PREFIX,
  payment: PAYMENT_PREFIX,
  payroll: PAYROLL_PREFIX,
};

function prefixOf(text: string): ProofKind | null {
  for (const kind of Object.keys(PREFIXES) as ProofKind[]) {
    if (text.startsWith(PREFIXES[kind])) return kind;
  }
  return null;
}

// base64 of the UTF-8 bytes, so any verifier label survives (plain btoa throws
// past Latin-1). Identical to btoa(json) for ASCII.
function toBase64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeProof(p: AnyProof): string {
  return PREFIXES[p.kind] + toBase64(JSON.stringify(p));
}

/** True when the text looks like one of these proofs (not the older balance disclosure). */
export function isGloamProof(text: string): boolean {
  return prefixOf(text.trim()) !== null;
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** A snark proof and its signals, as carried in a proof or a payroll part. */
function snarkShaped(proof: unknown, publicSignals: unknown): boolean {
  return (
    typeof proof === "object" &&
    proof !== null &&
    Array.isArray(publicSignals) &&
    publicSignals.every(isStr)
  );
}

/** Shape check only; verifyProof decides whether the contents hold. */
function wellFormed(p: AnyProof): boolean {
  const base =
    Number.isSafeInteger(p.chainId) &&
    isStr(p.pool) &&
    isStr(p.verifier) &&
    Number.isSafeInteger(p.expiresAt) &&
    isStr(p.asset);
  if (!base) return false;
  if (p.kind === "payroll") {
    return (
      isStr(p.total) &&
      Number.isSafeInteger(p.count) &&
      Array.isArray(p.payments) &&
      p.payments.every(
        (x) => x && isStr(x.commitment) && isStr(x.nullifier) && (x.txHash === null || isStr(x.txHash))
      ) &&
      Array.isArray(p.parts) &&
      p.parts.length > 0 &&
      p.parts.every((x) => x && snarkShaped(x.proof, x.publicSignals))
    );
  }
  if (!snarkShaped(p.proof, p.publicSignals)) return false;
  if (p.kind === "funds") {
    return isStr(p.threshold) && isStr(p.root) && Array.isArray(p.nullifiers) && p.nullifiers.every(isStr);
  }
  return (
    isStr(p.commitment) &&
    isStr(p.minAmount) &&
    (p.amount === null || isStr(p.amount)) &&
    (p.txHash === null || isStr(p.txHash))
  );
}

export function decodeProof(text: string): AnyProof {
  const t = text.trim();
  const kind = prefixOf(t);
  if (kind == null) throw new Error("Not a Gloam proof.");
  let p: AnyProof;
  try {
    p = JSON.parse(fromBase64(t.slice(PREFIXES[kind].length))) as AnyProof;
  } catch {
    throw new Error("This proof is damaged. Ask for it again.");
  }
  if (!p || p.v !== 1 || !Object.keys(PREFIXES).includes(String(p.kind))) {
    throw new Error("Not a Gloam proof.");
  }
  if (p.kind !== kind || !wellFormed(p)) {
    throw new Error("This proof is damaged. Ask for it again.");
  }
  return p;
}
