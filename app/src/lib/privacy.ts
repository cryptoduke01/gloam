/**
 * Privacy stack helpers — what we can harden without a new circuit.
 *
 * Sealed circuit public inputs include amountOutMin, rateIn, rateOut.
 * Publishing amountOutMin ≈ amountOut lets anyone recover size from rates.
 * Default: floor min-out so size stays private (only asset pair + rates leak).
 */

/** Circuit-safe floor: amountOut >= 1 always for any real trade. */
export const SIZE_PRIVACY_OUT_MIN = 1n;

export type SizePrivacyMode = "max" | "slippage";

/**
 * Public amountOutMin for sealedSwap calldata.
 * - max: 1 wei floor (strongest size privacy with current circuit)
 * - slippage: min = amountOut * (10000 - bps) / 10000 (leaks magnitude if tight)
 */
export function publicAmountOutMin(
  actualAmountOut: bigint,
  mode: SizePrivacyMode = "max",
  slippageBps = 500 // 5% if slippage mode
): bigint {
  if (actualAmountOut <= 0n) return SIZE_PRIVACY_OUT_MIN;
  if (mode === "max") return SIZE_PRIVACY_OUT_MIN;
  const bps = BigInt(Math.min(9_999, Math.max(0, slippageBps)));
  const min = (actualAmountOut * (10_000n - bps)) / 10_000n;
  return min < SIZE_PRIVACY_OUT_MIN ? SIZE_PRIVACY_OUT_MIN : min;
}

/**
 * Coarsen USD marks before they become public rates.
 * Reduces exact-time price fingerprint; does not replace amountOutMin fix.
 */
export function coarsenMarkUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return usd;
  if (usd >= 1000) return Math.round(usd / 10) * 10;
  if (usd >= 100) return Math.round(usd);
  if (usd >= 10) return Math.round(usd * 10) / 10;
  return Math.round(usd * 100) / 100;
}

/** What a chain observer can learn from a sealedSwap tx (honest). */
export const SEALED_PRIVACY_FACTS = {
  hidden: [
    "Trade size (amount in / amount out)",
    "Note secrets and change breakdown",
    "Who holds which vault note after the trade",
  ],
  public: [
    "That a vault sealedSwap happened",
    "Asset pair (e.g. ETH → TSLA)",
    "Public rate ratio used in the proof",
    "Caller address (wallet that submitted the tx)",
    "Nullifier and new commitment hashes (opaque)",
  ],
  cashOutReveals: [
    "Cash out (unshield) publishes asset, amount, and destination — by design",
  ],
} as const;
