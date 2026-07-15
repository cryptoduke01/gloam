/**
 * Sealed-size private trade status.
 * Circuit: contracts/circuits/sealedSwap/sealedSwap.circom (compile next).
 * Witness: buildSealedSwapWitness in proverSealedSwap.ts
 * Settlement contract + zkey: not deployed.
 */

import { sealedSwapArtifactsReady } from "./proverSealedSwap";

export type SealedTradeStatus =
  | "circuit_draft"
  | "artifacts_ready"
  | "live";

export function sealedTradeStatus(): SealedTradeStatus {
  if (sealedSwapArtifactsReady()) return "artifacts_ready";
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
