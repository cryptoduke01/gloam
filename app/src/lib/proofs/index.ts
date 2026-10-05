/**
 * Gloam proofs: proof of funds ("I hold at least X") and proof of payment.
 *
 *   proveFunds / provePayment   browser provers (./prove), dev Groth16 keys
 *   verifyProof                 snark + context + on-chain checks (./verify)
 *   encodeProof / decodeProof   the shareable text form (prefix + base64 JSON)
 *
 * Circuits: contracts/circuits/solvency (funds) and contracts/circuits/receipt
 * (payment). Witnesses: buildFundsWitness / buildReceiptWitness in @gloamtrade/sdk.
 * Demo mode (lib/demoFlag) returns pretend proofs that only a demo tab accepts.
 */
import type { AnyProof } from "./types";

export * from "./types";
export { proveFunds, provePayment, cleanVerifierLabel } from "./prove";
export { verifyProof } from "./verify";

export const FUNDS_PREFIX = "gloamfunds1:";
export const PAYMENT_PREFIX = "gloampay1:";

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
  return (p.kind === "funds" ? FUNDS_PREFIX : PAYMENT_PREFIX) + toBase64(JSON.stringify(p));
}

/** True when the text looks like one of these proofs (not the older balance disclosure). */
export function isGloamProof(text: string): boolean {
  const t = text.trim();
  return t.startsWith(FUNDS_PREFIX) || t.startsWith(PAYMENT_PREFIX);
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Shape check only; verifyProof decides whether the contents hold. */
function wellFormed(p: AnyProof): boolean {
  const base =
    Number.isSafeInteger(p.chainId) &&
    isStr(p.pool) &&
    isStr(p.verifier) &&
    Number.isSafeInteger(p.expiresAt) &&
    Array.isArray(p.publicSignals) &&
    p.publicSignals.every(isStr) &&
    typeof p.proof === "object" &&
    p.proof !== null &&
    isStr(p.asset);
  if (!base) return false;
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
  const prefix = t.startsWith(FUNDS_PREFIX) ? FUNDS_PREFIX : t.startsWith(PAYMENT_PREFIX) ? PAYMENT_PREFIX : null;
  if (prefix == null) throw new Error("Not a Gloam proof.");
  let p: AnyProof;
  try {
    p = JSON.parse(fromBase64(t.slice(prefix.length))) as AnyProof;
  } catch {
    throw new Error("This proof is damaged. Ask for it again.");
  }
  if (!p || p.v !== 1 || (p.kind !== "funds" && p.kind !== "payment")) {
    throw new Error("Not a Gloam proof.");
  }
  if ((p.kind === "funds") !== (prefix === FUNDS_PREFIX) || !wellFormed(p)) {
    throw new Error("This proof is damaged. Ask for it again.");
  }
  return p;
}
