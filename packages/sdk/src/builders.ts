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
import type { GloamIntent } from "./intents.js";

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
  const isNative = asset.toLowerCase() === NATIVE_ASSET.toLowerCase();
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
