/**
 * Public sealed-swap rates for testnet.
 *
 * Circuit constraint (exact): amountOut * rateOut === amountSwap * rateIn
 *
 * Rates are display marks (Yahoo / CoinGecko), not an on-chain oracle.
 */

/** USD cents scale keeps rates small and exact-math friendly. */
export const SEALED_RATE_SCALE = 100;

export type SealedRateQuote = {
  rateIn: bigint;
  rateOut: bigint;
  ethUsd: number;
  outUsd: number;
  live: boolean;
  source: "live" | "static" | "fallback_1_1";
};

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
  // Integer cents (or fixed 2dp) — avoids giant steps from 1e6 scale
  const rateIn = BigInt(Math.max(1, Math.round(ethUsd * SEALED_RATE_SCALE)));
  const rateOut = BigInt(Math.max(1, Math.round(outUsd * SEALED_RATE_SCALE)));
  return {
    rateIn,
    rateOut,
    ethUsd,
    outUsd,
    live: source === "live",
    source,
  };
}

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

/** Floor estimate for display only. */
export function estimateSealedOut(
  amountSwap: bigint,
  rateIn: bigint,
  rateOut: bigint
): bigint {
  if (rateOut === 0n || amountSwap <= 0n) return 0n;
  return (amountSwap * rateIn) / rateOut;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * O(1) exact fit for circuit equality:
 *   amountOut * rateOut === amountSwap * rateIn
 * with amountSwap ≤ wanted.
 *
 * amountOut must be a multiple of (rateIn / gcd(rateIn, rateOut)).
 */
export function exactSealedAmounts(
  amountSwapWanted: bigint,
  rateIn: bigint,
  rateOut: bigint
): { amountSwap: bigint; amountOut: bigint } | null {
  if (amountSwapWanted <= 0n || rateIn <= 0n || rateOut <= 0n) return null;

  const g = gcd(rateIn, rateOut);
  const step = rateIn / g; // minimal positive amountOut that can be exact

  let amountOut = (amountSwapWanted * rateIn) / rateOut;
  if (amountOut <= 0n) return null;

  // Round down to multiple of step
  amountOut = (amountOut / step) * step;
  if (amountOut <= 0n) return null;

  // Exact by construction: amountOut * rateOut is divisible by rateIn
  const amountSwap = (amountOut * rateOut) / rateIn;
  if (amountSwap <= 0n || amountSwap > amountSwapWanted) return null;
  if (amountOut * rateOut !== amountSwap * rateIn) return null;

  return { amountSwap, amountOut };
}

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
