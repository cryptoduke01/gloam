/**
 * Public sealed-swap rates for testnet.
 *
 * Circuit constraint (exact): amountOut * rateOut === amountSwap * rateIn
 * Floor division alone is NOT enough — remainder breaks the proof.
 *
 * Rates are display marks (Yahoo / CoinGecko), not an on-chain oracle.
 */

/** USD scale for integer rates (6 decimals is enough for stock marks). */
export const SEALED_RATE_SCALE = 1_000_000;

export type SealedRateQuote = {
  rateIn: bigint;
  rateOut: bigint;
  ethUsd: number;
  outUsd: number;
  /** true when both legs came from live marks */
  live: boolean;
  source: "live" | "static" | "fallback_1_1";
};

/**
 * Convert USD marks into circuit rates.
 * amountOut (18-dec out token) ≈ amountSwap (wei ETH) * ethUsd / outUsd
 */
export function marksToSealedRates(
  ethUsd: number,
  outUsd: number,
  source: "live" | "static" = "static"
): SealedRateQuote | null {
  if (
    !Number.isFinite(ethUsd) ||
    !Number.isFinite(outUsd) ||
    ethUsd <= 0 ||
    outUsd <= 0
  ) {
    return null;
  }
  const rateIn = BigInt(Math.round(ethUsd * SEALED_RATE_SCALE));
  const rateOut = BigInt(Math.round(outUsd * SEALED_RATE_SCALE));
  if (rateIn === 0n || rateOut === 0n) return null;
  return {
    rateIn,
    rateOut,
    ethUsd,
    outUsd,
    live: source === "live",
    source,
  };
}

/** Fixed 1:1 demo rates when marks are missing. */
export function fallbackOneToOneRates(): SealedRateQuote {
  return {
    rateIn: 1n,
    rateOut: 1n,
    ethUsd: 1,
    outUsd: 1,
    live: false,
    source: "fallback_1_1",
  };
}

/**
 * Floor estimate only (for UI). Prefer exactSealedAmounts for proofs.
 */
export function estimateSealedOut(
  amountSwap: bigint,
  rateIn: bigint,
  rateOut: bigint
): bigint {
  if (rateOut === 0n || amountSwap <= 0n) return 0n;
  return (amountSwap * rateIn) / rateOut;
}

/**
 * Pick amountSwap ≤ wanted and amountOut so the circuit equality holds exactly:
 *   amountOut * rateOut === amountSwap * rateIn
 *
 * Without this, mark-based rates almost always leave a remainder and snarkjs
 * fails with Assert Failed (not a DEX problem).
 */
export function exactSealedAmounts(
  amountSwapWanted: bigint,
  rateIn: bigint,
  rateOut: bigint
): { amountSwap: bigint; amountOut: bigint } | null {
  if (amountSwapWanted <= 0n || rateIn <= 0n || rateOut <= 0n) return null;

  let amountOut = (amountSwapWanted * rateIn) / rateOut;
  if (amountOut <= 0n) return null;

  // Walk amountOut down until amountOut * rateOut is divisible by rateIn
  // and amountSwap = product / rateIn stays within the note.
  // Bound steps so a pathological rate pair cannot hang the UI.
  const maxSteps = 10_000n;
  let steps = 0n;
  while (amountOut > 0n && steps < maxSteps) {
    const product = amountOut * rateOut;
    if (product % rateIn === 0n) {
      const amountSwap = product / rateIn;
      if (amountSwap > 0n && amountSwap <= amountSwapWanted) {
        // Final safety: exact equality
        if (amountOut * rateOut === amountSwap * rateIn) {
          return { amountSwap, amountOut };
        }
      }
    }
    amountOut -= 1n;
    steps += 1n;
  }
  return null;
}

/** Format wei as a short human amount (assumes 18 decimals). */
export function formatSealedAmount(wei: bigint, maxFrac = 4): string {
  if (wei === 0n) return "0";
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n;
  const frac = v % 10n ** 18n;
  if (frac === 0n) return `${neg ? "-" : ""}${whole}`;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, maxFrac)
    .replace(/0+$/, "");
  if (!fracStr) return `${neg ? "-" : ""}${whole}`;
  return `${neg ? "-" : ""}${whole}.${fracStr}`;
}
