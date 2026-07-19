/**
 * Smoke: exact sealed amounts + size-privacy min-out.
 * Run from app/: node scripts/smoke-sealed-rates.mjs
 */

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function exactSealedAmounts(amountSwapWanted, rateIn, rateOut) {
  if (amountSwapWanted <= 0n || rateIn <= 0n || rateOut <= 0n) return null;
  const g = gcd(rateIn, rateOut);
  const step = rateIn / g;
  let amountOut = (amountSwapWanted * rateIn) / rateOut;
  if (amountOut <= 0n) return null;
  amountOut = (amountOut / step) * step;
  if (amountOut <= 0n) return null;
  const amountSwap = (amountOut * rateOut) / rateIn;
  if (amountSwap <= 0n || amountSwap > amountSwapWanted) return null;
  if (amountOut * rateOut !== amountSwap * rateIn) return null;
  return { amountSwap, amountOut };
}

/** Mirrors app/src/lib/privacy.ts publicAmountOutMin */
function publicAmountOutMin(actual, mode = "max", slippageBps = 500) {
  if (actual <= 0n) return 1n;
  if (mode === "max") return 1n;
  const bps = BigInt(Math.min(9_999, Math.max(0, slippageBps)));
  const min = (actual * (10_000n - bps)) / 10_000n;
  return min < 1n ? 1n : min;
}

function coarsenMarkUsd(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return usd;
  if (usd >= 1000) return Math.round(usd / 10) * 10;
  if (usd >= 100) return Math.round(usd);
  if (usd >= 10) return Math.round(usd * 10) / 10;
  return Math.round(usd * 100) / 100;
}

const pairs = [
  [3n * 10n ** 15n, 1868_00n, 381_00n], // ETH→TSLA-ish cents
  [1n * 10n ** 17n, 2500_00n, 190_00n],
  [5n * 10n ** 16n, 1n, 1n],
];

for (const [wanted, rateIn, rateOut] of pairs) {
  const exact = exactSealedAmounts(wanted, rateIn, rateOut);
  if (!exact) throw new Error(`exact failed for rates ${rateIn}/${rateOut}`);
  if (exact.amountOut * rateOut !== exact.amountSwap * rateIn) {
    throw new Error("product mismatch");
  }
  if (exact.amountSwap > wanted) throw new Error("swap exceeds wanted");
  const min = publicAmountOutMin(exact.amountOut, "max");
  if (min !== 1n) throw new Error("privacy min should be 1");
  if (exact.amountOut > 1n && min === exact.amountOut) {
    throw new Error("min must not equal size");
  }
  const slip = publicAmountOutMin(exact.amountOut, "slippage", 500);
  if (slip >= exact.amountOut) throw new Error("5% slip min should be < out");
}

// 1:1 path
const wanted = 3n * 10n ** 15n;
const one = exactSealedAmounts(wanted, 1n, 1n);
if (!one || one.amountOut !== wanted) throw new Error("1:1 failed");

if (coarsenMarkUsd(1868.44) !== 1870) throw new Error("coarsen >=1000 to 10s");
if (coarsenMarkUsd(250.4) !== 250) throw new Error("coarsen 100s round");
if (coarsenMarkUsd(12.34) !== 12.3) throw new Error("coarsen 10s");
if (coarsenMarkUsd(3.456) !== 3.46) throw new Error("coarsen units");

console.log("smoke-sealed-rates: ok", {
  pairs: pairs.length,
  oneToOne: one.amountOut.toString(),
  publicMin: "1",
});
