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

function publicAmountOutMin(actual, mode = "max") {
  if (actual <= 0n) return 1n;
  if (mode === "max") return 1n;
  const min = actual / 2n;
  return min < 1n ? 1n : min;
}

const wanted = 3n * 10n ** 15n; // 0.003 ETH
const rateIn = BigInt(Math.round(1868 * 100));
const rateOut = BigInt(Math.round(381 * 100));
const exact = exactSealedAmounts(wanted, rateIn, rateOut);
if (!exact) throw new Error("exactSealedAmounts failed");
if (exact.amountOut * rateOut !== exact.amountSwap * rateIn) {
  throw new Error("product mismatch");
}
const min = publicAmountOutMin(exact.amountOut, "max");
if (min !== 1n) throw new Error("privacy min should be 1");
if (min === exact.amountOut) throw new Error("min must not equal size");

// 1:1 path
const one = exactSealedAmounts(wanted, 1n, 1n);
if (!one || one.amountOut !== wanted) throw new Error("1:1 failed");

console.log("smoke-sealed-rates: ok", {
  out: exact.amountOut.toString(),
  swap: exact.amountSwap.toString(),
  publicMin: min.toString(),
});
