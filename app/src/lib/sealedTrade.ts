/**
 * Sealed-size private trade — types only.
 * No prove path, no contracts. See contracts/SEALED_TRADE.md and /docs/sealed-trade.
 */

export type SealedTradeStatus = "not_shipped";

export const SEALED_TRADE_STATUS: SealedTradeStatus = "not_shipped";

/** Candidate architectures (product language, not implementations). */
export type SealedArchitecture = "intent_batch" | "vault_amm" | "hybrid";

/**
 * Sketch of future public inputs — **not** wired to a circuit.
 * Final layout will change; do not build proofs against this.
 */
export type SealedSwapPublicInputsSketch = {
  root: string;
  nullifierIn: string;
  /** New note for the output asset */
  newCommitmentOut: string;
  assetIn: string;
  assetOut: string;
  /** Whether amountIn is public or only amountOutMin is public is TBD */
  amountInPublic?: string;
  amountOutMin: string;
};

export function sealedTradeReady(): boolean {
  return false;
}
