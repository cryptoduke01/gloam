/**
 * Self-test: the Portfolio's private balance headline. A vault of 100 USDG and
 * 1,000 GLOAM read "2 assets" once an unpriced asset stopped being counted as
 * $0; it reads "$100 + 1,000 GLOAM" where GLOAM has no price, and dollars only
 * when everything is priced.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-portfolio-value.mts
 */
import assert from "node:assert/strict";
import { privateHeadline } from "../src/lib/portfolioValue";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const h = (sealedUsd: number, unpriced: string[], showUsd = true) =>
  privateHeadline({ showUsd, sealedUsd, unpriced, vaultValue: "2 assets", formatUsd: usd });

assert.equal(h(1100, []), "$1,100", "everything priced: dollars");
assert.equal(h(100, ["1,000 GLOAM"]), "$100 + 1,000 GLOAM", "the priced part, and the amount of what has no price");
assert.equal(h(0, ["500 EURC"]), "500 EURC", "nothing priced: the amount, never $0");
assert.equal(h(10, ["500 EURC", "0.1 ETH", "3 cbBTC", "1 PONS"]), "$10 + 500 EURC + 0.1 ETH + 2 more");
assert.equal(h(0, []), "$0", "an empty vault");
assert.equal(h(100, ["1,000 GLOAM"], false), "2 assets", "dollars off: amounts");
console.log("selftest-portfolio-value: 6 checks passed");
