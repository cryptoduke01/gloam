/**
 * Witness builder for sealedSwap.circom (not wired to snarkjs artifacts yet).
 * When zkey/wasm ship, proveSealedSwapInBrowser will mirror proveTransferInBrowser.
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

export type SealedSwapWitness = {
  publicInputs: {
    root: bigint;
    nullifier: bigint;
    newCommitmentOut: bigint;
    newCommitmentChange: bigint;
    assetIn: bigint;
    assetOut: bigint;
    amountOutMin: bigint;
    rateIn: bigint;
    rateOut: bigint;
  };
  circomInput: Record<string, string | string[]>;
  outNote: {
    secret: Hex;
    commitment: Hex;
    amountWei: string;
    asset: Address;
  };
  changeNote: {
    secret: Hex;
    commitment: Hex;
    amountWei: string;
    asset: Address;
  };
  blocker: string | null;
};

/**
 * Build sealed-swap witness for a fixed rate (testnet).
 * rate: amountOut * rateOut === amountSwap * rateIn
 * e.g. rateIn=1, rateOut=1 → 1:1 for faucet demos.
 */
export async function buildSealedSwapWitness(args: {
  secretHex: Hex;
  amountIn: bigint;
  amountSwap: bigint;
  assetIn?: Address;
  assetOut: Address;
  amountOutMin: bigint;
  rateIn: bigint;
  rateOut: bigint;
  path: PoseidonMerklePath;
}): Promise<SealedSwapWitness> {
  const assetIn = args.assetIn ?? NATIVE_ASSET;
  const amountChange = args.amountIn - args.amountSwap;
  let blocker: string | null = null;

  if (args.amountSwap <= 0n || amountChange < 0n) {
    blocker = "Invalid swap size.";
  }

  // amountOut from rate: amountOut = amountSwap * rateIn / rateOut
  if (args.rateOut === 0n) blocker = "rateOut cannot be zero.";
  const amountOut =
    args.rateOut === 0n
      ? 0n
      : (args.amountSwap * args.rateIn) / args.rateOut;

  if (!blocker && amountOut < args.amountOutMin) {
    blocker = "Output below minimum (slippage).";
  }

  const secretIn = hexToField(args.secretHex);
  const commitmentIn = await noteCommitmentPoseidon(
    secretIn,
    args.amountIn,
    assetIn
  );
  const nullifier = await noteNullifierPoseidon(secretIn, commitmentIn);
  if (commitmentIn !== args.path.leaf) {
    blocker = "Note secret does not match the vault leaf.";
  }

  const secretOut = await randomSecretField();
  const secretChange = await randomSecretField();
  const newCommitmentOut = await noteCommitmentPoseidon(
    secretOut,
    amountOut,
    args.assetOut
  );
  const newCommitmentChange = await noteCommitmentPoseidon(
    secretChange,
    amountChange,
    assetIn
  );

  const circomInput = {
    root: args.path.root.toString(),
    nullifier: nullifier.toString(),
    newCommitmentOut: newCommitmentOut.toString(),
    newCommitmentChange: newCommitmentChange.toString(),
    assetIn: toField(BigInt(assetIn)).toString(),
    assetOut: toField(BigInt(args.assetOut)).toString(),
    amountOutMin: args.amountOutMin.toString(),
    rateIn: args.rateIn.toString(),
    rateOut: args.rateOut.toString(),
    secretIn: secretIn.toString(),
    amountIn: args.amountIn.toString(),
    pathElements: args.path.pathElements.map((x) => x.toString()),
    pathIndices: args.path.pathIndices.map(String),
    secretOut: secretOut.toString(),
    amountOut: amountOut.toString(),
    secretChange: secretChange.toString(),
    amountChange: amountChange.toString(),
    amountSwap: args.amountSwap.toString(),
  };

  return {
    publicInputs: {
      root: args.path.root,
      nullifier,
      newCommitmentOut,
      newCommitmentChange,
      assetIn: toField(BigInt(assetIn)),
      assetOut: toField(BigInt(args.assetOut)),
      amountOutMin: args.amountOutMin,
      rateIn: args.rateIn,
      rateOut: args.rateOut,
    },
    circomInput,
    outNote: {
      secret: fieldToHex(secretOut),
      commitment: fieldToHex(newCommitmentOut),
      amountWei: amountOut.toString(),
      asset: args.assetOut,
    },
    changeNote: {
      secret: fieldToHex(secretChange),
      commitment: fieldToHex(newCommitmentChange),
      amountWei: amountChange.toString(),
      asset: assetIn,
    },
    blocker,
  };
}

/** Dev zkey/wasm shipped under /public/circuits — settlement still not live */
export function sealedSwapArtifactsReady(): boolean {
  return true;
}
