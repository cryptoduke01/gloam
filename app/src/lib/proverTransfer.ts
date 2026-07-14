/**
 * Private send (transfer) witness for Poseidon transfer circuit.
 * Spend one note → payment note + change note.
 */

import type { Address, Hex } from "viem";
import {
  noteCommitmentPoseidon,
  noteNullifierPoseidon,
  randomSecretField,
} from "./notePoseidon";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { fieldToHex, hexToField, toField } from "./poseidon";
import { NATIVE_ASSET } from "./shield";

export type TransferWitness = {
  circomInput: Record<string, string | string[]>;
  publicInputs: {
    root: bigint;
    nullifier: bigint;
    newCommitment0: bigint;
    newCommitment1: bigint;
  };
  /** Payment note for the recipient (share off-app) */
  paymentNote: {
    secret: Hex;
    commitment: Hex;
    amountWei: string;
    asset: Address;
  };
  /** Change stays with sender */
  changeNote: {
    secret: Hex;
    commitment: Hex;
    amountWei: string;
    asset: Address;
  };
  checks: {
    commitmentMatches: boolean;
    amountsOk: boolean;
  };
  blocker: string | null;
};

export async function buildTransferWitness(args: {
  secretHex: Hex;
  amountIn: bigint;
  amountPay: bigint;
  asset?: Address;
  path: PoseidonMerklePath;
}): Promise<TransferWitness> {
  const asset = args.asset ?? NATIVE_ASSET;
  const amountChange = args.amountIn - args.amountPay;
  const amountsOk = args.amountPay > 0n && amountChange >= 0n && args.amountPay + amountChange === args.amountIn;

  const secretIn = hexToField(args.secretHex);
  const commitmentIn = await noteCommitmentPoseidon(
    secretIn,
    args.amountIn,
    asset
  );
  const nullifier = await noteNullifierPoseidon(secretIn, commitmentIn);
  const commitmentMatches = commitmentIn === args.path.leaf;

  const secretPay = await randomSecretField();
  const secretChange = await randomSecretField();
  const newCommitment0 = await noteCommitmentPoseidon(
    secretPay,
    args.amountPay,
    asset
  );
  const newCommitment1 = await noteCommitmentPoseidon(
    secretChange,
    amountChange,
    asset
  );

  let blocker: string | null = null;
  if (!commitmentMatches) blocker = "This note secret does not match the leaf.";
  else if (!amountsOk) blocker = "Send amount must be > 0 and ≤ your note.";
  else blocker = null;

  const circomInput = {
    root: args.path.root.toString(),
    nullifier: nullifier.toString(),
    newCommitment0: newCommitment0.toString(),
    newCommitment1: newCommitment1.toString(),
    secretIn: secretIn.toString(),
    amountIn: args.amountIn.toString(),
    asset: toField(BigInt(asset)).toString(),
    pathElements: args.path.pathElements.map((x) => x.toString()),
    pathIndices: args.path.pathIndices.map(String),
    secretPay: secretPay.toString(),
    amountPay: args.amountPay.toString(),
    secretChange: secretChange.toString(),
    amountChange: amountChange.toString(),
  };

  return {
    circomInput,
    publicInputs: {
      root: args.path.root,
      nullifier,
      newCommitment0,
      newCommitment1,
    },
    paymentNote: {
      secret: fieldToHex(secretPay),
      commitment: fieldToHex(newCommitment0),
      amountWei: args.amountPay.toString(),
      asset,
    },
    changeNote: {
      secret: fieldToHex(secretChange),
      commitment: fieldToHex(newCommitment1),
      amountWei: amountChange.toString(),
      asset,
    },
    checks: { commitmentMatches, amountsOk },
    blocker,
  };
}
