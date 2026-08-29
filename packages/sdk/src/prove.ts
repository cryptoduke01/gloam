/**
 * Proving adapter. The witness builders are pure; proving is environment-bound
 * (snarkjs + circuit artifacts), so it is injected. A `Prover` takes a circom
 * input and returns packed proof bytes.
 *
 * `proveGroth16` is a convenience prover that runs snarkjs.groth16.fullProve.
 * `wasm`/`zkey` are file paths (node) or URLs (browser). snarkjs is loaded
 * dynamically and must be installed by the consumer (it is not a hard dep of
 * the SDK core).
 */

import type { Hex } from "viem";
import { packGroth16Proof, type Groth16Proof } from "./proof.js";

export type ProveResult = {
  proofBytes: Hex;
  publicSignals?: string[];
};

/** Injected prover: circom input -> packed proof bytes. */
export type Prover = (
  circomInput: Record<string, string | string[]>
) => Promise<ProveResult>;

export interface Groth16Artifacts {
  wasm: string;
  zkey: string;
}

export async function proveGroth16(
  circomInput: Record<string, string | string[]>,
  wasm: string,
  zkey: string
): Promise<{ proofBytes: Hex; publicSignals: string[]; proof: Groth16Proof }> {
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circomInput,
    wasm,
    zkey
  );
  return {
    proofBytes: packGroth16Proof(proof as Groth16Proof),
    publicSignals: publicSignals as string[],
    proof: proof as Groth16Proof,
  };
}

/** Bind a `Prover` to a fixed set of artifacts (node paths or browser URLs). */
export function artifactProver(artifacts: Groth16Artifacts): Prover {
  return (circomInput) =>
    proveGroth16(circomInput, artifacts.wasm, artifacts.zkey);
}
