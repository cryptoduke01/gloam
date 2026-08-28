/**
 * SDK self-test — sealed-rate math parity with the circuit constraint.
 *
 * The sealedSwap circuit enforces exactly:  amountOut * rateOut === amountSwap * rateIn
 * with amountSwap <= wanted. This asserts the SDK's exactSealedAmounts always
 * produces amounts that satisfy that equality, plus the size-privacy floor.
 *
 * Run after build:  node test/rates.selftest.mjs
 */
import {
  exactSealedAmounts,
  marksToSealedRates,
  fallbackOneToOneRates,
  estimateSealedOut,
  publicAmountOutMin,
  SIZE_PRIVACY_OUT_MIN,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

// 1) Circuit equality holds across a spread of rates and sizes.
const rateCases = [
  [300000n, 25000n], // ETH ~3000, stock ~250
  [1n, 1n],
  [450012n, 1n],
  [7n, 3n],
  [999983n, 100001n],
];
const sizes = [1n, 1000n, 10n ** 15n, 3n * 10n ** 18n, 123456789n];
for (const [rateIn, rateOut] of rateCases) {
  for (const wanted of sizes) {
    const r = exactSealedAmounts(wanted, rateIn, rateOut);
    if (r === null) continue; // legitimately no exact fit below `wanted`
    assert(
      r.amountOut * rateOut === r.amountSwap * rateIn,
      `equality broken: ${r.amountSwap}*${rateIn} != ${r.amountOut}*${rateOut}`
    );
    assert(r.amountSwap > 0n && r.amountOut > 0n, "amounts must be positive");
    assert(r.amountSwap <= wanted, `amountSwap ${r.amountSwap} > wanted ${wanted}`);
  }
}

// 2) marksToSealedRates feeds exactSealedAmounts and stays exact.
const q = marksToSealedRates(3000.55, 250.25, "live");
assert(q !== null, "marksToSealedRates returned null for valid marks");
const fit = exactSealedAmounts(2n * 10n ** 18n, q.rateIn, q.rateOut);
assert(fit !== null, "no exact fit for live marks");
assert(
  fit.amountOut * q.rateOut === fit.amountSwap * q.rateIn,
  "live-mark equality broken"
);

// 3) Invalid marks reject; 1:1 fallback is always valid.
assert(marksToSealedRates(0, 100) === null, "zero mark should reject");
assert(marksToSealedRates(100, -1) === null, "negative mark should reject");
const one = fallbackOneToOneRates();
assert(one.rateIn === 1n && one.rateOut === 1n, "fallback must be 1:1");

// 4) Size-privacy floor: max mode always floors amountOutMin to 1 wei.
assert(publicAmountOutMin(10n ** 18n, "max") === SIZE_PRIVACY_OUT_MIN, "max mode must floor to 1");
assert(publicAmountOutMin(0n, "max") === SIZE_PRIVACY_OUT_MIN, "zero out floors to 1");
const slip = publicAmountOutMin(1000n, "slippage", 500);
assert(slip >= SIZE_PRIVACY_OUT_MIN && slip <= 1000n, "slippage min in range");

// 5) estimateSealedOut is a floor and never exceeds the exact fit.
assert(estimateSealedOut(0n, 1n, 1n) === 0n, "zero in => zero out");
assert(estimateSealedOut(1000n, 300000n, 25000n) === 12000n, "floor estimate wrong");

console.log(`rates.selftest: ok (${checks} assertions)`);
