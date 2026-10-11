/**
 * The older balance disclosure (gloamdisc1). Retired as a proof of holding.
 *
 * It reuses the shield circuit, which proves commitment == Poseidon(secret,
 * amount, asset). That is exactly what every deposit proves to the vault, and
 * every deposit publishes that proof in its calldata. So anyone can lift a
 * deposit's proof off the chain, wrap it as gloamdisc1, and it checks out: it
 * shows a deposit happened, not who holds the money (ZK review 2026-10-11,
 * ZK-2). Checkers answer "can't confirm who holds this" for it, never
 * "verified". New exact balance proofs are context-bound and never published.
 *
 * buildDisclosure stays only so old links still decode; the app no longer
 * offers it.
 */
import type { Hex } from "viem";
import { CIRCUIT_ARTIFACTS, assertArtifactIntegrity } from "./circuitArtifacts";
import { proveShieldInBrowser } from "./proveClient";
import { demoVerifyProof, isDemoProof } from "./demo/proof";

/** What every checker says about a gloamdisc1 proof, whatever its math. */
export const LEGACY_DISCLOSURE =
  "Older proof format. It can't show who holds this balance: anyone can copy one from a public deposit. Ask for a new proof.";

export type Disclosure = {
  v: 1;
  chainId: number;
  pool: string;
  /** All three are the shield proof's public signals (field-element decimals). */
  commitment: string;
  amount: string;
  asset: string;
  /** Raw snarkjs Groth16 proof. */
  proof: unknown;
};

const PREFIX = "gloamdisc1:";

/** Build a disclosure for a note the holder owns. Runs the shield prover. */
export async function buildDisclosure(args: {
  chainId: number;
  pool: string;
  secret: Hex;
  commitment: Hex;
  amount: bigint;
  asset: string; // token address; 0x000…000 for ETH
}): Promise<Disclosure> {
  const { proof, publicSignals } = await proveShieldInBrowser({
    commitment: BigInt(args.commitment).toString(),
    amount: args.amount.toString(),
    asset: BigInt(args.asset).toString(),
    secret: BigInt(args.secret).toString(),
  });
  // publicSignals order matches shield.circom: [commitment, amount, asset]
  return {
    v: 1,
    chainId: args.chainId,
    pool: args.pool,
    commitment: publicSignals[0]!,
    amount: publicSignals[1]!,
    asset: publicSignals[2]!,
    proof,
  };
}

export function encodeDisclosure(d: Disclosure): string {
  return PREFIX + btoa(JSON.stringify(d));
}

export function decodeDisclosure(s: string): Disclosure {
  const trimmed = s.trim();
  const body = trimmed.startsWith(PREFIX)
    ? trimmed.slice(PREFIX.length)
    : trimmed;
  const d = JSON.parse(atob(body)) as Disclosure;
  if (d.v !== 1 || !d.commitment || !d.amount || d.asset === undefined) {
    throw new Error("Not a valid Gloam disclosure.");
  }
  return d;
}

/**
 * Whether the shield proof's math holds, with the hash-pinned checking key.
 * A true here only means a deposit with these values was proven once; it says
 * nothing about who holds the note (see the top of this file).
 */
export async function verifyDisclosureProof(d: Disclosure): Promise<boolean> {
  // Recording demo: a proof from the pretend wallet checks out (only in a demo tab).
  if (isDemoProof(d.proof)) return demoVerifyProof();
  const snarkjs = await import("snarkjs");
  const { path, sha256 } = CIRCUIT_ARTIFACTS.shieldVkey;
  await assertArtifactIntegrity(path, sha256);
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error("Could not load the disclosure verification key.");
  const vkey = await res.json();
  const publicSignals = [d.commitment, d.amount, d.asset].map(String);
  return snarkjs.groth16.verify(vkey, publicSignals, d.proof);
}
