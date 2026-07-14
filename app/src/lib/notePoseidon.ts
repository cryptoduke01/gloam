/**
 * Poseidon note scheme — matches unshield.circom + NoteLibPoseidon.
 * commitment = Poseidon(secret, amount, asset)
 * nullifier  = Poseidon(secret, commitment)
 */

import type { Address, Hex } from "viem";
import { NATIVE_ASSET } from "./shield";
import {
  fieldToHex,
  hexToField,
  poseidon2,
  poseidon3,
  toField,
} from "./poseidon";

export const POSEIDON_PROOF_LAYOUT_VERSION = 2;

export async function randomSecretField(): Promise<bigint> {
  const bytes = new Uint8Array(31); // stay under field
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return toField(v);
}

export async function noteCommitmentPoseidon(
  secret: bigint,
  amount: bigint,
  asset: Address = NATIVE_ASSET
): Promise<bigint> {
  return poseidon3(secret, amount, toField(BigInt(asset)));
}

export async function noteNullifierPoseidon(
  secret: bigint,
  commitment: bigint
): Promise<bigint> {
  return poseidon2(secret, commitment);
}

export async function makeBoundNotePoseidon(
  amount: bigint,
  asset: Address = NATIVE_ASSET
): Promise<{
  secret: Hex;
  commitment: Hex;
  nullifier: Hex;
  secretField: bigint;
  commitmentField: bigint;
  nullifierField: bigint;
}> {
  const secretField = await randomSecretField();
  const commitmentField = await noteCommitmentPoseidon(
    secretField,
    amount,
    asset
  );
  const nullifierField = await noteNullifierPoseidon(
    secretField,
    commitmentField
  );
  return {
    secret: fieldToHex(secretField),
    commitment: fieldToHex(commitmentField),
    nullifier: fieldToHex(nullifierField),
    secretField,
    commitmentField,
    nullifierField,
  };
}

export async function openNotePoseidon(
  secretHex: Hex,
  amount: bigint,
  asset: Address
): Promise<{ commitment: Hex; nullifier: Hex }> {
  const secret = hexToField(secretHex);
  const c = await noteCommitmentPoseidon(secret, amount, asset);
  const n = await noteNullifierPoseidon(secret, c);
  return { commitment: fieldToHex(c), nullifier: fieldToHex(n) };
}
