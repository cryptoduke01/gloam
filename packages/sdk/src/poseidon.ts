/**
 * Poseidon helpers for circuit-compatible notes/trees.
 * Uses circomlibjs (same constants as the circom circuits).
 */

import type { Poseidon } from "circomlibjs";
import { FIELD_PRIME } from "./constants.js";

let _poseidon: Promise<Poseidon> | null = null;

/**
 * circomlibjs carries a few megabytes of round constants, so it is imported on
 * first use. A web app that only shows balances never downloads it.
 */
export async function getPoseidon(): Promise<Poseidon> {
  _poseidon ??= import("circomlibjs")
    .then((m) => m.buildPoseidon())
    .catch((e: unknown) => {
      _poseidon = null;
      throw e;
    });
  return _poseidon;
}

export function toField(x: bigint | string | number): bigint {
  let v = typeof x === "bigint" ? x : BigInt(x);
  v = v % FIELD_PRIME;
  if (v < 0n) v += FIELD_PRIME;
  return v;
}

export async function poseidon2(a: bigint, b: bigint): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(poseidon([toField(a), toField(b)])) as bigint;
}

export async function poseidon3(
  a: bigint,
  b: bigint,
  c: bigint
): Promise<bigint> {
  const poseidon = await getPoseidon();
  return poseidon.F.toObject(
    poseidon([toField(a), toField(b), toField(c)])
  ) as bigint;
}

/** Field element as 0x-hex 32-byte (for storage / display). */
export function fieldToHex(f: bigint): `0x${string}` {
  return `0x${f.toString(16).padStart(64, "0")}` as `0x${string}`;
}

export function hexToField(hex: string): bigint {
  return toField(BigInt(hex));
}
