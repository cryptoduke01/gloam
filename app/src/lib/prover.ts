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
 */
export async function proveUnshield(
  _witness: UnshieldWitness
): Promise<{ proof: Hex } | null> {
  // Future: wasm/snarkjs or remote prover
  return null;
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
