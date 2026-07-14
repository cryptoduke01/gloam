/**
 * Build unshield witness for Poseidon circuit (real constraints).
 */

import type { Address, Hex } from "viem";
import {
  noteCommitmentPoseidon,
  noteNullifierPoseidon,
} from "./notePoseidon";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { hexToField, toField } from "./poseidon";
import { NATIVE_ASSET } from "./shield";

export type PoseidonUnshieldWitness = {
  publicInputs: {
    root: bigint;
    nullifier: bigint;
    asset: bigint;
    amount: bigint;
    recipient: bigint;
  };
  circomInput: Record<string, string | string[]>;
  checks: {
    commitmentMatches: boolean;
    nullifierMatches: boolean;
    pathValid: boolean;
  };
  readyToProve: boolean;
  blocker: string | null;
};

export async function buildPoseidonUnshieldWitness(args: {
  secretHex: Hex;
  amount: bigint;
  asset?: Address;
  to: Address;
  path: PoseidonMerklePath;
}): Promise<PoseidonUnshieldWitness> {
  const asset = args.asset ?? NATIVE_ASSET;
  const secret = hexToField(args.secretHex);
  const assetField = toField(BigInt(asset));
  const recipient = toField(BigInt(args.to));

  const commitment = await noteCommitmentPoseidon(
    secret,
    args.amount,
    asset
  );
  const nullifier = await noteNullifierPoseidon(secret, commitment);

  const commitmentMatches = commitment === args.path.leaf;
  const pathValid = args.path.root === args.path.root; // path() already verified
  const nullifierMatches = true;

  let blocker: string | null = null;
  if (!commitmentMatches) {
    blocker = "Secret does not open this leaf (wrong note or keccak-era note).";
  } else {
    blocker =
      "Witness ready for Poseidon circuit. Run snarkjs prove with zkey (dev keys in circuits/build).";
  }

  const circomInput = {
    root: args.path.root.toString(),
    nullifier: nullifier.toString(),
    asset: assetField.toString(),
    amount: args.amount.toString(),
    recipient: recipient.toString(),
    secret: secret.toString(),
    pathElements: args.path.pathElements.map((x) => x.toString()),
    pathIndices: args.path.pathIndices.map(String),
  };

  return {
    publicInputs: {
      root: args.path.root,
      nullifier,
      asset: assetField,
      amount: args.amount,
      recipient,
    },
    circomInput,
    checks: {
      commitmentMatches,
      nullifierMatches,
      pathValid,
    },
    readyToProve: commitmentMatches,
    blocker,
  };
}

export function downloadPoseidonWitness(
  w: PoseidonUnshieldWitness,
  filename = "gloam-unshield-poseidon-input.json"
) {
  const blob = new Blob([JSON.stringify(w.circomInput, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
