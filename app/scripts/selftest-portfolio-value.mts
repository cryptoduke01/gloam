/**
 * Self-test: the Portfolio's private balance headline. A vault of 100 USDG and
 * 1,000 GLOAM read "2 assets" once an unpriced asset stopped being counted as
 * $0; it reads "$100 + 1,000 GLOAM" where GLOAM has no price, and dollars only
 * when everything is priced. What sits beside the dollars is a tidy amount.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-portfolio-value.mts
 */
import assert from "node:assert/strict";
import { privateHeadline, tidyAmount } from "../src/lib/portfolioValue";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const h = (sealedUsd: number, unpriced: string[], showUsd = true) =>
  privateHeadline({ showUsd, sealedUsd, unpriced, vaultValue: "2 assets", formatUsd: usd });

assert.equal(h(1100, []), "$1,100", "everything priced: dollars");
assert.equal(h(100, ["1,000 GLOAM"]), "$100 + 1,000 GLOAM", "the priced part, and the amount of what has no price");
assert.equal(h(0, ["500 EURC"]), "500 EURC", "nothing priced: the amount, never $0");
assert.equal(h(10, ["500 EURC", "0.1 ETH", "3 cbBTC", "1 PONS"]), "$10 + 500 EURC + 0.1 ETH + 2 more");
assert.equal(h(0, []), "$0", "an empty vault");
assert.equal(h(100, ["1,000 GLOAM"], false), "2 assets", "dollars off: amounts");

// The amounts in the big number: short, and never a long decimal.
assert.equal(h(1204, [`${tidyAmount(8.032039)} PONS`]), "$1,204 + 8.03 PONS", "the reported headline");
assert.equal(tidyAmount(8.032039), "8.03");
assert.equal(tidyAmount(8), "8");
assert.equal(tidyAmount(500), "500", "EURC stays by amount, whole");
assert.equal(tidyAmount(500.5), "500.5");
assert.equal(tidyAmount(1234.567891), "1,235");
assert.equal(tidyAmount(999_999.4), "999,999");
assert.equal(tidyAmount(12_345_678.123456), "12.3M");
assert.equal(tidyAmount(0.0339), "0.0339");
assert.equal(tidyAmount(0.123456789), "0.123");
assert.equal(tidyAmount(0.00012345), "0.000123");
assert.equal(tidyAmount(0.00001), "<0.0001");
assert.equal(tidyAmount(0), "0");
assert.equal(tidyAmount(Number.NaN), "0");
assert.equal(h(10, [`${tidyAmount(500)} EURC`]), "$10 + 500 EURC", "EURC is left out of the dollars and named by amount");
for (const n of [8.032039, 0.123456789, 1234.567891, 3.14159265, 99.999999, 12_345_678.123456, 0.000123456789]) {
  assert.ok(tidyAmount(n).length <= 8, `${n} reads short: ${tidyAmount(n)}`);
}
console.log("selftest-portfolio-value: all checks passed");
