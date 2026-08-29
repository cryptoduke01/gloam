/**
 * Browser snarkjs fullProve for the Poseidon circuits (unshield, transfer,
 * sealedSwap). Artifacts under /public/circuits (dev ceremony, replace for
 * production). Proof packing and field helpers come from @gloam/sdk; this file
 * is the browser-specific proving glue.
 */

import type { Hex } from "viem";
import { packGroth16Proof, type Groth16Proof } from "@gloam/sdk";
import {
  assertSealedSwapArtifacts,
  assertTransferArtifacts,
  assertUnshieldArtifacts,
  CIRCUIT_ARTIFACTS,
} from "./circuitArtifacts";

export { fieldToBytes32 } from "@gloam/sdk";
export type { Groth16Proof };

const UNSHIELD_WASM = CIRCUIT_ARTIFACTS.unshieldWasm.path;
const UNSHIELD_ZKEY = CIRCUIT_ARTIFACTS.unshieldZkey.path;
const TRANSFER_WASM = CIRCUIT_ARTIFACTS.transferWasm.path;
const TRANSFER_ZKEY = CIRCUIT_ARTIFACTS.transferZkey.path;
const SEALED_SWAP_WASM = CIRCUIT_ARTIFACTS.sealedSwapWasm.path;
const SEALED_SWAP_ZKEY = CIRCUIT_ARTIFACTS.sealedSwapZkey.path;

async function fullProve(
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

export async function proveUnshieldInBrowser(
  circomInput: Record<string, string | string[]>
) {
  await assertUnshieldArtifacts();
  return fullProve(circomInput, UNSHIELD_WASM, UNSHIELD_ZKEY);
}

export async function proveTransferInBrowser(
  circomInput: Record<string, string | string[]>
) {
  await assertTransferArtifacts();
  return fullProve(circomInput, TRANSFER_WASM, TRANSFER_ZKEY);
}

/** Prove sealed swap (dev keys). Settlement live on the RH testnet Poseidon vault. */
export async function proveSealedSwapInBrowser(
  circomInput: Record<string, string | string[]>
) {
  await assertSealedSwapArtifacts();
  return fullProve(circomInput, SEALED_SWAP_WASM, SEALED_SWAP_ZKEY);
}
