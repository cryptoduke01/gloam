/**
 * Intent builders. Each returns an unsigned GloamIntent an app or agent can
 * inspect, then sign and broadcast. The plan layer is portable; the exec layer
 * is the resolved on-chain call.
 *
 * Shield is live. private_send / unshield / private_trade builders land as the
 * prover core is ported (they require a witness + Groth16 proof).
 */

import type { Address } from "viem";
import { NATIVE_ASSET, RH_TESTNET_CHAIN_ID, SEALED_VAULT } from "./constants.js";
import { makeBoundNotePoseidon, type BoundNote } from "./note.js";
import type { GloamIntent, TradeSide } from "./intents.js";
import type { PoseidonMerklePath } from "./merkle.js";
import { fieldToBytes32 } from "./proof.js";
import type { Prover } from "./prove.js";
import {
  buildPoseidonUnshieldWitness,
  buildTransferWitness,
  buildSealedSwapWitness,
  type NoteExport,
} from "./witness.js";

const isNativeAsset = (a: Address) =>
  a.toLowerCase() === NATIVE_ASSET.toLowerCase();

export interface ShieldIntentParams {
  /** Amount to shield, in wei (native) or token base units. */
  amountWei: bigint;
  /** Asset address. Defaults to native ETH (zero address). */
  asset?: Address;
  chainId?: number;
  /** Sealed vault to deposit into. Defaults to the RH testnet vault. */
  poolAddress?: Address;
  agentAddress?: Address | null;
}

export interface ShieldIntent extends GloamIntent<"shield"> {
  /** The freshly minted note. The caller MUST persist `note.secret` to spend later. */
  note: BoundNote;
}

/**
 * Build an unsigned shield (deposit) intent. Computes the Poseidon note
 * commitment that binds (secret, amount, asset) and the exec args for
 * ShieldPoolPoseidon.shield(asset, amount, commitment).
 */
export async function buildShieldIntent(
  params: ShieldIntentParams
): Promise<ShieldIntent> {
  if (params.amountWei <= 0n) throw new Error("amountWei must be positive");
  const asset = params.asset ?? NATIVE_ASSET;
  const isNative = isNativeAsset(asset);
  const note = await makeBoundNotePoseidon(params.amountWei, asset);

  return {
    intent: "shield",
    chainId: params.chainId ?? RH_TESTNET_CHAIN_ID,
    agentAddress: params.agentAddress ?? null,
    plan: {
      asset: isNative ? "ETH" : asset,
      amountWei: params.amountWei,
    },
    privacy:
      "Shielding is a public deposit: the amount and asset are visible on-chain. The note commitment hides who can later spend it, so future private sends and trades are unlinkable to this deposit.",
    execution:
      "Unsigned. Sign and broadcast shield(asset, amount, commitment) on Robinhood Chain testnet; attach msg.value for native ETH. Persist note.secret to spend later.",
    exec: {
      poolAddress: params.poolAddress ?? SEALED_VAULT,
      fn: "shield",
      valueWei: isNative ? params.amountWei : 0n,
      args: [asset, params.amountWei, note.commitment],
    },
    note,
  };
}

// ── unshield (cash out) ───────────────────────────────────────────────────────

export interface UnshieldIntentParams {
  secretHex: `0x${string}`;
  amountWei: bigint;
  asset?: Address;
  to: Address;
  path: PoseidonMerklePath;
  prove: Prover;
  poolAddress?: Address;
  chainId?: number;
  agentAddress?: Address | null;
}

/** Build a signed-ready unshield intent. exec.args match unshield(proof, root, nullifier, asset, to, amount). */
export async function buildUnshieldIntent(
  params: UnshieldIntentParams
): Promise<GloamIntent<"unshield">> {
  const asset = params.asset ?? NATIVE_ASSET;
  const w = await buildPoseidonUnshieldWitness({
    secretHex: params.secretHex,
    amount: params.amountWei,
    asset,
    to: params.to,
    path: params.path,
  });
  if (!w.readyToProve) throw new Error(w.blocker ?? "unshield witness not ready");
  const { proofBytes } = await params.prove(w.circomInput);

  return {
    intent: "unshield",
    chainId: params.chainId ?? RH_TESTNET_CHAIN_ID,
    agentAddress: params.agentAddress ?? null,
    plan: { asset: isNativeAsset(asset) ? "ETH" : asset, amountWei: params.amountWei, to: params.to },
    privacy:
      "Unshield is the public exit: the amount, asset, and recipient become visible. The nullifier keeps the source note unlinkable to your other activity.",
    execution:
      "Unsigned. Sign and broadcast unshield(proof, root, nullifier, asset, to, amount) on RH testnet.",
    exec: {
      poolAddress: params.poolAddress ?? SEALED_VAULT,
      fn: "unshield",
      valueWei: 0n,
      args: [
        proofBytes,
        fieldToBytes32(w.publicInputs.root),
        fieldToBytes32(w.publicInputs.nullifier),
        asset,
        params.to,
        params.amountWei,
      ],
    },
  };
}

// ── private send (transfer) ───────────────────────────────────────────────────

export interface PrivateSendIntentParams {
  secretHex: `0x${string}`;
  amountInWei: bigint;
  amountPayWei: bigint;
  asset?: Address;
  path: PoseidonMerklePath;
  prove: Prover;
  poolAddress?: Address;
  chainId?: number;
  agentAddress?: Address | null;
}

export interface PrivateSendIntent extends GloamIntent<"private_send"> {
  /** Payment note to hand the recipient; change note stays with the sender. */
  paymentNote: NoteExport;
  changeNote: NoteExport;
}

/** Build a signed-ready private-send intent. exec.args match transfer(proof, root, nullifier, [c0, c1]). */
export async function buildPrivateSendIntent(
  params: PrivateSendIntentParams
): Promise<PrivateSendIntent> {
  const asset = params.asset ?? NATIVE_ASSET;
  const w = await buildTransferWitness({
    secretHex: params.secretHex,
    amountIn: params.amountInWei,
    amountPay: params.amountPayWei,
    asset,
    path: params.path,
  });
  if (w.blocker) throw new Error(w.blocker);
  const { proofBytes } = await params.prove(w.circomInput);

  return {
    intent: "private_send",
    chainId: params.chainId ?? RH_TESTNET_CHAIN_ID,
    agentAddress: params.agentAddress ?? null,
    plan: { asset: isNativeAsset(asset) ? "ETH" : asset, amountWei: params.amountPayWei },
    privacy:
      "Private send stays inside the vault: no public transfer, no visible amount. The recipient opens the payment note; the change note stays with you.",
    execution:
      "Unsigned. Sign and broadcast transfer(proof, root, nullifier, [c0, c1]) on RH testnet, then hand the payment note to the recipient (or post it via GloamPayMemo).",
    exec: {
      poolAddress: params.poolAddress ?? SEALED_VAULT,
      fn: "transfer",
      valueWei: 0n,
      args: [
        proofBytes,
        fieldToBytes32(w.publicInputs.root),
        fieldToBytes32(w.publicInputs.nullifier),
        [
          fieldToBytes32(w.publicInputs.newCommitment0),
          fieldToBytes32(w.publicInputs.newCommitment1),
        ],
      ],
    },
    paymentNote: w.paymentNote,
    changeNote: w.changeNote,
  };
}

// ── private trade (sealedSwap) ────────────────────────────────────────────────

export interface PrivateTradeIntentParams {
  secretHex: `0x${string}`;
  amountInWei: bigint;
  amountSwapWei: bigint;
  assetIn?: Address;
  assetOut: Address;
  amountOutMinWei: bigint;
  rateIn: bigint;
  rateOut: bigint;
  side?: TradeSide;
  market?: string;
  path: PoseidonMerklePath;
  prove: Prover;
  poolAddress?: Address;
  chainId?: number;
  agentAddress?: Address | null;
}

export interface PrivateTradeIntent extends GloamIntent<"private_trade"> {
  outNote: NoteExport;
  changeNote: NoteExport;
}

/**
 * Build a signed-ready private-trade intent. exec.args match
 * sealedSwap(proof, root, nullifier, cOut, cChange, assetIn, assetOut, amountOutMin, rateIn, rateOut).
 */
export async function buildPrivateTradeIntent(
  params: PrivateTradeIntentParams
): Promise<PrivateTradeIntent> {
  const assetIn = params.assetIn ?? NATIVE_ASSET;
  const w = await buildSealedSwapWitness({
    secretHex: params.secretHex,
    amountIn: params.amountInWei,
    amountSwap: params.amountSwapWei,
    assetIn,
    assetOut: params.assetOut,
    amountOutMin: params.amountOutMinWei,
    rateIn: params.rateIn,
    rateOut: params.rateOut,
    path: params.path,
  });
  if (w.blocker) throw new Error(w.blocker);
  const { proofBytes } = await params.prove(w.circomInput);

  return {
    intent: "private_trade",
    chainId: params.chainId ?? RH_TESTNET_CHAIN_ID,
    agentAddress: params.agentAddress ?? null,
    plan: {
      market: params.market ?? params.assetOut,
      side: params.side ?? "buy",
    },
    privacy:
      "Private trade keeps the size off the open book: on-chain min-out is a floor, not your real amount. The explorer sees a proof and an asset pair, never how much.",
    execution:
      "Unsigned. Sign and broadcast sealedSwap(proof, root, nullifier, cOut, cChange, assetIn, assetOut, amountOutMin, rateIn, rateOut) on RH testnet.",
    exec: {
      poolAddress: params.poolAddress ?? SEALED_VAULT,
      fn: "sealedSwap",
      valueWei: 0n,
      args: [
        proofBytes,
        fieldToBytes32(w.publicInputs.root),
        fieldToBytes32(w.publicInputs.nullifier),
        fieldToBytes32(w.publicInputs.newCommitmentOut),
        fieldToBytes32(w.publicInputs.newCommitmentChange),
        assetIn,
        params.assetOut,
        w.publicInputs.amountOutMin,
        w.publicInputs.rateIn,
        w.publicInputs.rateOut,
      ],
    },
    outNote: w.outNote,
    changeNote: w.changeNote,
  };
}
