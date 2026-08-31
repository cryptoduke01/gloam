/**
 * Phase-2 note crypto, must match contracts/src/lib/NoteLib.sol
 * commitment = keccak256(secret || amount || asset)  // abi.encodePacked
 * nullifier  = keccak256(secret || commitment)
 */

import {
  encodePacked,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { NATIVE_ASSET } from "./shield";

export const PROOF_LAYOUT_VERSION = 2;

/** Unshield public inputs order on ShieldPool v2 */
export type UnshieldPublicInputs = {
  root: Hex;
  nullifier: Hex;
  asset: Address;
  amount: bigint;
  to: Address;
};

/** Transfer public inputs order on ShieldPool v2 */
export type TransferPublicInputs = {
  root: Hex;
  nullifier: Hex;
  newCommitment0: Hex;
  newCommitment1: Hex;
};

export function randomSecret(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Bound commitment, required for future unshield proofs */
export function noteCommitment(
  secret: Hex,
  amount: bigint,
  asset: Address = NATIVE_ASSET
): Hex {
  return keccak256(
    encodePacked(
      ["bytes32", "uint256", "address"],
      [secret, amount, asset]
    )
  );
}

export function noteNullifier(secret: Hex, commitment: Hex): Hex {
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [secret, commitment])
  );
}

/** Encode unshield public inputs as uint256[] for IVerifier */
export function encodeUnshieldInputs(p: UnshieldPublicInputs): bigint[] {
  return [
    BigInt(p.root),
    BigInt(p.nullifier),
    BigInt(p.asset),
    p.amount,
    BigInt(p.to),
  ];
}

export function encodeTransferInputs(p: TransferPublicInputs): bigint[] {
  return [
    BigInt(p.root),
    BigInt(p.nullifier),
    BigInt(p.newCommitment0),
    BigInt(p.newCommitment1),
  ];
}

/**
 * Build a new note for shield().
 * Always binds amount + asset so Phase-2 circuits can open the note.
 */
export function makeBoundNote(
  amount: bigint,
  asset: Address = NATIVE_ASSET
): { secret: Hex; commitment: Hex; nullifier: Hex } {
  const secret = randomSecret();
  const commitment = noteCommitment(secret, amount, asset);
  const nullifier = noteNullifier(secret, commitment);
  return { secret, commitment, nullifier };
}
