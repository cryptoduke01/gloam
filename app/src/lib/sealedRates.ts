/**
 * Public sealed-swap rates for testnet.
 *
 * Circuit constraint: amountOut * rateOut === amountSwap * rateIn
 * so amountOut = amountSwap * rateIn / rateOut (integer division).
 *
 * Rates are display marks (Yahoo / CoinGecko), not an on-chain oracle.
 * Honest: anyone can pass any public rateIn/rateOut; inventory risk is on the pool.
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

export function estimateSealedOut(
  amountSwap: bigint,
  rateIn: bigint,
  rateOut: bigint
): bigint {
  if (rateOut === 0n || amountSwap <= 0n) return 0n;
  return (amountSwap * rateIn) / rateOut;
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
