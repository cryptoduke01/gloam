/**
 * Browser snarkjs fullProve for Poseidon unshield / transfer.
 * Artifacts in /public/circuits (dev ceremony — replace for production).
 */

import {
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from "viem";
import {
  assertSealedSwapArtifacts,
  assertTransferArtifacts,
  assertUnshieldArtifacts,
  CIRCUIT_ARTIFACTS,
} from "./circuitArtifacts";

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
};

const UNSHIELD_WASM = CIRCUIT_ARTIFACTS.unshieldWasm.path;
const UNSHIELD_ZKEY = CIRCUIT_ARTIFACTS.unshieldZkey.path;
const TRANSFER_WASM = CIRCUIT_ARTIFACTS.transferWasm.path;
const TRANSFER_ZKEY = CIRCUIT_ARTIFACTS.transferZkey.path;

/** Pack proof for IVerifier adapters: abi.encode(a, b, c) with G2 swap */
export function packGroth16Proof(proof: Groth16Proof): Hex {
  const a: [bigint, bigint] = [BigInt(proof.pi_a[0]!), BigInt(proof.pi_a[1]!)];
  // Solidity expects G2 coords swapped vs snarkjs JSON
  const b: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0]![1]!), BigInt(proof.pi_b[0]![0]!)],
    [BigInt(proof.pi_b[1]![1]!), BigInt(proof.pi_b[1]![0]!)],
  ];
  const c: [bigint, bigint] = [BigInt(proof.pi_c[0]!), BigInt(proof.pi_c[1]!)];
  return encodeAbiParameters(
    parseAbiParameters("uint256[2], uint256[2][2], uint256[2]"),
    [a, b, c]
  );
}

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

const SEALED_SWAP_WASM = CIRCUIT_ARTIFACTS.sealedSwapWasm.path;
const SEALED_SWAP_ZKEY = CIRCUIT_ARTIFACTS.sealedSwapZkey.path;

/** Prove sealed swap (dev keys). Settlement contract not live yet. */
export async function proveSealedSwapInBrowser(
  circomInput: Record<string, string | string[]>
) {
  await assertSealedSwapArtifacts();
  return fullProve(circomInput, SEALED_SWAP_WASM, SEALED_SWAP_ZKEY);
}

export function fieldToBytes32(field: bigint | string): Hex {
  const v = typeof field === "bigint" ? field : BigInt(field);
  return `0x${v.toString(16).padStart(64, "0")}` as Hex;
}
