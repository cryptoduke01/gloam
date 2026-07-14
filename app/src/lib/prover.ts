/**
 * Unshield / transfer prover surface.
 * Witness packing works today; ZK proof generation waits on circuits + keys.
 */

import type { Address, Hex } from "viem";
import {
  encodeUnshieldInputs,
  noteCommitment,
  noteNullifier,
  type UnshieldPublicInputs,
} from "./note";
import type { MerklePath } from "./merkle";
import { verifyMerklePath } from "./merkle";
import { NATIVE_ASSET } from "./shield";

export type UnshieldWitness = {
  /** Public inputs for IVerifier / ShieldPool.unshield */
  publicInputs: UnshieldPublicInputs;
  publicInputsUint: bigint[];
  /** Private witness (never send to chain raw — only inside a proof) */
  private: {
    secret: Hex;
    pathElements: Hex[];
    pathIndices: number[];
    leafIndex: number;
    commitment: Hex;
  };
  /** Sanity checks before proving */
  checks: {
    commitmentMatches: boolean;
    nullifierMatches: boolean;
    pathValid: boolean;
  };
  readyToProve: boolean;
  blocker: string | null;
};

export type BuildUnshieldArgs = {
  secret: Hex;
  amount: bigint;
  asset?: Address;
  to: Address;
  path: MerklePath;
  /** Must be a known pool root (usually path.root or currentRoot) */
  root: Hex;
};

/**
 * Build a full unshield witness from a bound note + Merkle path.
 * Does not generate a snark — that needs the circuit binary + proving key.
 */
export function buildUnshieldWitness(args: BuildUnshieldArgs): UnshieldWitness {
  const asset = args.asset ?? NATIVE_ASSET;
  const commitment = noteCommitment(args.secret, args.amount, asset);
  const nullifier = noteNullifier(args.secret, commitment);

  const commitmentMatches =
    commitment.toLowerCase() === args.path.leaf.toLowerCase();
  const pathValid = verifyMerklePath(
    args.path.leaf,
    args.path.leafIndex,
    args.path.pathElements,
    args.root
  );
  const nullifierMatches = true; // derived consistently

  const publicInputs: UnshieldPublicInputs = {
    root: args.root,
    nullifier,
    asset,
    amount: args.amount,
    to: args.to,
  };

  let blocker: string | null = null;
  if (!commitmentMatches) {
    blocker =
      "Note secret does not open this leaf (unbound Phase-1 note or wrong secret).";
  } else if (!pathValid) {
    blocker = "Merkle path does not match root — resync the tree.";
  } else {
    blocker =
      "ZK prover not shipped yet (circuit + proving key). Witness is ready.";
  }

  const readyToProve =
    commitmentMatches && pathValid && blocker.includes("ZK prover");

  return {
    publicInputs,
    publicInputsUint: encodeUnshieldInputs(publicInputs),
    private: {
      secret: args.secret,
      pathElements: args.path.pathElements,
      pathIndices: args.path.pathIndices,
      leafIndex: args.path.leafIndex,
      commitment,
    },
    checks: {
      commitmentMatches,
      nullifierMatches,
      pathValid,
    },
    readyToProve,
    blocker,
  };
}

/**
 * Call when a real prover exists. Today always returns null.
 * Wire snarkjs fullProve here once `circuits/build/unshield` keys exist.
 */
export async function proveUnshield(
  _witness: UnshieldWitness
): Promise<{ proof: Hex; publicSignals: bigint[] } | null> {
  return null;
}

/** Circom / snarkjs input.json shape (field elements as decimal strings). */
export function witnessToCircomInput(w: UnshieldWitness): Record<string, string | string[]> {
  return {
    root: BigInt(w.publicInputs.root).toString(),
    nullifier: BigInt(w.publicInputs.nullifier).toString(),
    asset: BigInt(w.publicInputs.asset).toString(),
    amount: w.publicInputs.amount.toString(),
    recipient: BigInt(w.publicInputs.to).toString(),
    secret: BigInt(w.private.secret).toString(),
    pathElements: w.private.pathElements.map((e) => BigInt(e).toString()),
    pathIndices: w.private.pathIndices.map(String),
  };
}

/** Full debug export (includes commitment; still not a proof). */
export function witnessToExportJson(w: UnshieldWitness) {
  return {
    version: 1,
    proofLayout: 2,
    readyToProve: w.readyToProve,
    blocker: w.blocker,
    checks: w.checks,
    publicInputs: {
      root: w.publicInputs.root,
      nullifier: w.publicInputs.nullifier,
      asset: w.publicInputs.asset,
      amount: w.publicInputs.amount.toString(),
      to: w.publicInputs.to,
    },
    publicInputsUint: w.publicInputsUint.map(String),
    commitment: w.private.commitment,
    leafIndex: w.private.leafIndex,
    circomInput: witnessToCircomInput(w),
  };
}

export function formatWitnessSummary(w: UnshieldWitness): string {
  const lines = [
    `root ${w.publicInputs.root.slice(0, 18)}…`,
    `nullifier ${w.publicInputs.nullifier.slice(0, 18)}…`,
    `amount ${w.publicInputs.amount.toString()}`,
    `commitment ok: ${w.checks.commitmentMatches}`,
    `path ok: ${w.checks.pathValid}`,
    w.blocker ?? "ok",
  ];
  return lines.join("\n");
}

/** Download helper for browsers */
export function downloadWitnessJson(w: UnshieldWitness, filename = "gloam-unshield-witness.json") {
  const blob = new Blob([JSON.stringify(witnessToExportJson(w), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
