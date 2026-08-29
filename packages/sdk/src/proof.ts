/**
 * Groth16 proof packing for the IVerifier adapters, and field/bytes helpers.
 * Pure (viem ABI encoding only). The snarkjs fullProve step is environment-bound
 * and injected by the app (browser) or a node prover.
 */

import { encodeAbiParameters, parseAbiParameters, type Hex } from "viem";

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
};

/** Pack a snarkjs Groth16 proof as abi.encode(a, b, c) with the G2 coords swapped. */
export function packGroth16Proof(proof: Groth16Proof): Hex {
  const a: [bigint, bigint] = [BigInt(proof.pi_a[0]!), BigInt(proof.pi_a[1]!)];
  // Solidity expects G2 coords swapped vs the snarkjs JSON.
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

export function fieldToBytes32(field: bigint | string): Hex {
  const v = typeof field === "bigint" ? field : BigInt(field);
  return `0x${v.toString(16).padStart(64, "0")}` as Hex;
}
