/**
 * Self-test: what a bridge route costs, and when the panel warns before
 * anything is sent (lib/bridge routeCost, expensiveRoute): over 3% of what you
 * pay and at least $1.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-bridge-cost.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { SWAP_BUFFER_MAX_SHARE, SWAP_SLIPPAGE_BPS, expensiveRoute, routeCost, swapLeftover } = await import("../src/lib/bridge");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const quote = (usd: number | null, receive: string, feeUsd: number, more: { extra?: string; gasUsd?: number | null } = {}) => ({
  send: { usd },
  receive: { amount: receive },
  feeUsd,
  ...more,
});

test("a well-priced route: no warning", () => {
  // $100 of USDC on Base in, 99.60 USDG out
  const q = quote(100, "99.60", 0.35);
  const c = routeCost(q);
  assert.ok(c && c.share !== null);
  assert.equal(Math.round(c.usd * 100) / 100, 0.4, "what you pay less what comes out, above Relay's 35 cents");
  assert.equal(Math.round(c.share * 1000) / 1000, 0.004);
  assert.equal(expensiveRoute(q), null);
});

test("a badly priced route warns, with the total and the share", () => {
  // $200 of BTC in, 190 USDG out: $10 gone, 5%
  const w = expensiveRoute(quote(200, "190", 2.1));
  assert.ok(w);
  assert.equal(Math.round(w.usd * 100) / 100, 10);
  assert.equal(Math.round(w.share * 1000) / 1000, 0.05);
});

test("cents on a small test stay quiet, even as a big share", () => {
  // $2 in, 1.85 out: 7.5% but only 15 cents
  assert.equal(expensiveRoute(quote(2, "1.85", 0.1)), null);
});

test("the price buffer back to the wallet counts as coming out", () => {
  // $50 in, 47.9 private plus 1.6 back to the wallet: 50 cents, 1%
  assert.equal(expensiveRoute(quote(50, "47.9", 0.2, { extra: "1.6" })), null);
});

test("the network fee counts when Relay prices it", () => {
  // $40 in, 39.4 out, plus $1.20 of gas on the paying chain: $1.80, 4.5%
  const w = expensiveRoute(quote(40, "39.4", 0.3, { gasUsd: 1.2 }));
  assert.ok(w);
  assert.equal(Math.round(w.usd * 100) / 100, 1.8);
});

test("never less than Relay's own fee, even when the price rounds the other way", () => {
  // $30 in, 30.00 out but a $1.50 fee: $1.50, 5%
  const w = expensiveRoute(quote(30, "30", 1.5));
  assert.ok(w);
  assert.equal(w.usd, 1.5);
});

test("when Relay doesn't price what you pay, the cost is its fee and nothing is guessed", () => {
  assert.deepEqual(routeCost(quote(null, "10", 0.8)), { usd: 0.8, share: null });
  assert.equal(expensiveRoute(quote(null, "10", 25)), null);
});

// USDG in 6 decimals, the way the route has them.
const usdg = (n: number) => BigInt(Math.round(n * 1_000_000));
const leftover = (amount: number, out: number, paidUsd: number | null, feeUsd: number) =>
  swapLeftover({ out: usdg(out), amount: usdg(amount), decimals: 6, paidUsd, feeUsd });
/** A same-chain quote the way the route builds it. */
const swap = (paid: number | null, amount: number, out: number, feeUsd: number) => ({
  send: { usd: paid },
  receive: { amount: String(amount), symbol: "USDG" },
  feeUsd,
  gasUsd: 0.01,
  extra: leftover(amount, out, paid, feeUsd),
});

test("Relay states the output above the amount: that is the leftover", () => {
  assert.equal(leftover(1000, 1014.97, 1015.5, 0.61), "14.97");
  assert.equal(leftover(1000, 1014.97, null, 0.61), "14.97", "no dollar price needed");
});

test("Relay states exactly the amount on a padded input: the dollars say what's left", () => {
  // Live 2026-11-02: in $1,011.69, out 1000.0, fee 61 cents, about 11 USDG back
  assert.equal(leftover(1000, 1000, 1011.69, 0.61), "11.080000");
});

test("no dollar price, or no fee: no estimate", () => {
  assert.equal(leftover(1000, 1000, null, 0.61), null);
  assert.equal(leftover(1000, 1000, NaN, 0.61), null);
  assert.equal(leftover(1000, 1000, 1011.69, NaN), null);
});

test("never below zero", () => {
  assert.equal(leftover(1000, 1000, 1000.2, 0.61), null, "the fee is more than the gap");
  assert.equal(leftover(1000, 1000, 999, 0.6), null, "paid less than the amount");
  assert.equal(leftover(1000, 1000, 1000.61, 0.61), null, "exactly nothing left");
});

test("an estimate stops at what a buffer takes", () => {
  assert.equal(leftover(1000, 1000, 1060, 0.64), (1060 * SWAP_BUFFER_MAX_SHARE).toFixed(6));
  assert.equal(leftover(1000, 1060, 1061, 0.64), "60", "a stated output is never capped");
});

test("an estimated leftover makes no warning of an ordinary buffer", () => {
  const q = swap(1011.69, 1000, 1000, 0.61);
  assert.equal(expensiveRoute(q), null);
  const c = routeCost(q);
  assert.ok(c);
  assert.equal(Math.round(c.usd * 100) / 100, 0.62, "Relay's fee and the gas, not the $11 that comes back");
  // A costly fee near the line: the buffer on top must not tip it over.
  // $207 in, $200 private, $4.40 of fee: 2.1%, not the 3.4% the gap would say.
  assert.equal(expensiveRoute({ ...swap(207, 200, 200, 4.4), gasUsd: 0 }), null);
  assert.ok(routeCost({ ...swap(207, 200, 200, 4.4), extra: null })!.share! > 0.03, "that gap alone would have warned");
});

test("an estimated leftover doesn't hide a route that really costs", () => {
  // $1,060 in for exactly 1,000: more than any buffer, so most of the gap is lost
  const w = expensiveRoute(swap(1060, 1000, 1000, 0.64));
  assert.ok(w, "still warned");
  assert.equal(Math.round(w.usd * 100) / 100, 44.11);
  assert.ok(w.share > 0.03);
  // A route Relay itself prices badly stays warned too
  assert.ok(expensiveRoute(swap(1060, 1000, 1010, 0.64)));
});

test("the warning and the row agree: what's counted as lost plus what comes back is the gap", () => {
  const q = swap(1060, 1000, 1000, 0.64);
  assert.equal(Math.round((routeCost(q)!.usd - 0.01 + Number(q.extra)) * 100) / 100, 60);
});

test("no dollar price: nothing estimated, no warning guessed", () => {
  const q = swap(null, 1000, 1000, 0.61);
  assert.equal(q.extra, null);
  assert.deepEqual(routeCost(q), { usd: 0.62, share: null });
});

const route = readFileSync(new URL("../src/app/api/bridge/private/route.ts", import.meta.url), "utf8");

test("the tighter slippage goes on the same-chain swap only, and the refusals stay", () => {
  assert.equal(SWAP_SLIPPAGE_BPS, "30");
  assert.match(route, /\.\.\.\(sameChain \? \{ slippageTolerance: SWAP_SLIPPAGE_BPS \} : \{\}\)/);
  assert.equal(route.match(/slippageTolerance/g)?.length, 1, "nothing else sets it");
  assert.match(route, /\(sameChain \? outAmount >= amount : outAmount === amount\)/);
  assert.match(route, /extra: sameChain \? swapLeftover\(/, "a bridge never reports a leftover");
});

console.log(`\nbridge cost: ${passed} passed`);
