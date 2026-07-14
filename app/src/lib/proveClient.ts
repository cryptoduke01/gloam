/**
 * Browser snarkjs fullProve for Poseidon unshield.
 * Artifacts in /public/circuits (dev ceremony — replace for production).
 */

import {
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from "viem";

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
};

const WASM_URL = "/circuits/unshield.wasm";
const ZKEY_URL = "/circuits/unshield_final.zkey";

/** Pack proof for UnshieldIVerifier: abi.encode(a, b, c) with G2 swap */
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

export async function proveUnshieldInBrowser(
  circomInput: Record<string, string | string[]>
): Promise<{ proofBytes: Hex; publicSignals: string[]; proof: Groth16Proof }> {
  // dynamic import — snarkjs is heavy
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circomInput,
    WASM_URL,
    ZKEY_URL
  );
  const proofBytes = packGroth16Proof(proof as Groth16Proof);
  return {
    proofBytes,
    publicSignals: publicSignals as string[],
    proof: proof as Groth16Proof,
  };
}

export function fieldToBytes32(field: bigint | string): Hex {
  const v = typeof field === "bigint" ? field : BigInt(field);
  return `0x${v.toString(16).padStart(64, "0")}` as Hex;
}
