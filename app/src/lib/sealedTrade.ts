/**
 * Sealed-size private trade status.
 * Circuit: contracts/circuits/sealedSwap/sealedSwap.circom
 * Witness: buildSealedSwapWitness in proverSealedSwap.ts
 * Browser prove: proveSealedSwapInBrowser in proveClient.ts
 * Settlement: ShieldPoolPoseidon.sealedSwap on RH testnet (see poseidon-testnet.json)
 */

import { sealedSwapArtifactsReady } from "./proverSealedSwap";

export type SealedTradeStatus =
  | "circuit_draft"
  | "artifacts_ready"
  | "live";

/**
 * Static product status for docs / banners.
 * On-chain readiness is still re-checked in SealedTradePanel (verifier address).
 */
export function sealedTradeStatus(): SealedTradeStatus {
  // Dev wasm/zkey shipped; sealed vault + verifier live on RH testnet.
  if (sealedSwapArtifactsReady()) return "live";
  return "circuit_draft";
}

export function sealedTradeReady(): boolean {
  return sealedTradeStatus() === "live";
}

/** Public inputs for sealedSwap.circom (9 signals) */
export type SealedSwapPublicInputs = {
  root: string;
  nullifier: string;
  newCommitmentOut: string;
  newCommitmentChange: string;
  assetIn: string;
  assetOut: string;
  amountOutMin: string;
  rateIn: string;
  rateOut: string;
};

export type SealedArchitecture = "fixed_rate_v0" | "intent_batch" | "vault_amm";
