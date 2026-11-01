/**
 * Self-test: what a bridge route costs, and when the panel warns before
 * anything is sent (lib/bridge routeCost, expensiveRoute): over 3% of what you
 * pay and at least $1.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-bridge-cost.mts
 */
import assert from "node:assert/strict";

const { bridgeFeeLines, bridgeFeeSetting, expensiveRoute, quotedAppFee, relayAppFees, routeCost } = await import("../src/lib/bridge");

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

const TREASURY = "0xB3900ac9350903218e4c7597bAb0f008F01B30B8";

test("Gloam's cut is off unless both settings are valid", () => {
  const set = (bps?: string, to?: string) => bridgeFeeSetting({ BRIDGE_FEE_BPS: bps, BRIDGE_FEE_RECIPIENT: to });
  assert.equal(set(), null);
  assert.equal(set("30"), null, "no recipient");
  assert.equal(set(undefined, TREASURY), null, "no rate");
  assert.equal(set("0", TREASURY), null);
  assert.equal(set("101", TREASURY), null, "over the 1% most");
  assert.equal(set("2.5", TREASURY), null, "a whole number of bps");
  assert.equal(set("30", "0x123"), null, "a bad address");
  assert.deepEqual(set("30", TREASURY), { bps: 30, recipient: TREASURY });
  assert.equal(relayAppFees(null), undefined, "Relay is sent nothing when it's off");
  assert.deepEqual(relayAppFees({ bps: 30, recipient: TREASURY }), [{ recipient: TREASURY, fee: "30" }]);
});

test("a cut that is on always has a line of its own, and one that is off never does", () => {
  assert.equal(quotedAppFee(null, "0.30", 100), null);
  assert.deepEqual(quotedAppFee({ bps: 30 }, "0.31", 100), { bps: 30, usd: 0.31 }, "what Relay says it charged");
  assert.deepEqual(quotedAppFee({ bps: 30 }, undefined, 100), { bps: 30, usd: 0.3 }, "Relay left it out: the rate on what is paid");
  assert.deepEqual(quotedAppFee({ bps: 30 }, undefined, NaN), { bps: 30, usd: 0 }, "nothing priced: the rate still shows");

  // $0.65 taken in all, $0.30 of it Gloam's
  assert.deepEqual(bridgeFeeLines({ feeUsd: 0.65, appFee: { bps: 30, usd: 0.3 } }), { relayUsd: 0.35, app: { bps: 30, usd: 0.3 } });
  assert.deepEqual(bridgeFeeLines({ feeUsd: 0.35, appFee: null }), { relayUsd: 0.35, app: null }, "off: the fee is Relay's alone");
  assert.equal(bridgeFeeLines({ feeUsd: 0.2, appFee: { bps: 30, usd: 0.3 } }).relayUsd, 0, "never below zero");
});

test("Gloam's cut counts towards what a route costs", () => {
  const q = { send: { usd: 100 }, receive: { amount: "95" }, feeUsd: 4, appFee: { bps: 100, usd: 1 } };
  assert.equal(routeCost(q)!.usd, 5);
  assert.ok(expensiveRoute(q), "over 3% with the cut in it");
});

console.log(`\nbridge cost: ${passed} passed`);
