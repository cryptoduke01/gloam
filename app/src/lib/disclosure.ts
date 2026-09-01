/**
 * Selective disclosure. Private by default, prove only what you choose.
 *
 * A disclosure lets the holder of a shielded note prove to a chosen party that
 * they own a note worth `amount` of `asset` in the Gloam pool, WITHOUT revealing
 * the note secret (so it stays unspendable) or any of their other notes. It
 * reuses the shield circuit, which proves commitment == Poseidon(secret, amount,
 * asset); the auditor separately confirms the commitment is a real leaf in the
 * pool (pool.commitmentSeen). Together that is verifiable proof of holdings.
 */
import type { Hex } from "viem";
import { proveShieldInBrowser } from "./proveClient";

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

const VKEY_PATH = "/circuits/shield_vkey.json";
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
 * Verify the proof: confirms the discloser knows a secret binding the commitment
 * to (amount, asset). Membership (commitment is a real note in the pool) is a
 * separate on-chain check done by the caller via pool.commitmentSeen.
 */
export async function verifyDisclosureProof(d: Disclosure): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  const res = await fetch(VKEY_PATH, { cache: "force-cache" });
  if (!res.ok) throw new Error("Could not load the disclosure verification key.");
  const vkey = await res.json();
  const publicSignals = [d.commitment, d.amount, d.asset];
  return snarkjs.groth16.verify(vkey, publicSignals, d.proof);
}
