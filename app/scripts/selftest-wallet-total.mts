/**
 * Self-test: the Portfolio's "In your wallet" card (lib/portfolioValue).
 *
 * Review, 25 Oct 2026: the card had no total, and a zero USDG or PYUSD row on
 * Ethereum Sepolia read "$1.00" (the price of one unit) under rows that read
 * their value (ETH 0.0339, $80; USDC 60, $60). The card now has the dollars
 * the wallet holds in its header, names what has no dollar price beside them
 * ("$140", "+ 20 EURC") instead of adding it as $0, shows no figure while a
 * balance or a price is still loading, gives every row its value ($0.00 for
 * none), and lists what is held first in the Vault's order with the zero
 * balances after it.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-wallet-total.mts
 */
import assert from "node:assert/strict";
import { formatUsd, formatUsdCompact } from "../src/lib/markets";
import { splitWalletRows, walletRowValue, walletTotal, type WalletHolding } from "../src/lib/portfolioValue";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const row = (symbol: string, amount: number, unit: number | null, dollar = false, pending = false): WalletHolding => ({
  symbol,
  amount,
  usd: unit == null ? null : amount * unit,
  dollar,
  text: `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}`,
  pending,
});
const total = (rows: WalletHolding[], o: { showUsd?: boolean; loading?: boolean } = {}) =>
  walletTotal({ showUsd: o.showUsd ?? true, loading: o.loading ?? false, rows, formatUsd: formatUsdCompact });

// The Ethereum Sepolia wallet from the review: ETH at $2,360.
const sepolia = [
  row("ETH", 0.0339, 2360),
  row("USDC", 60, 1, true),
  row("USDG", 0, 1, true),
  row("PYUSD", 0, 1, true),
  row("EURC", 20, null),
];

test("the total is the dollars held, with EURC named beside it, never added as $0", () => {
  assert.deepEqual(total(sepolia), { state: "ready", figure: "$140", extra: "+ 20 EURC" });
});

test("everything priced: dollars alone", () => {
  assert.deepEqual(total(sepolia.filter((r) => r.symbol !== "EURC")), { state: "ready", figure: "$140", extra: null });
});

test("nothing priced held: the amount, not $0", () => {
  assert.deepEqual(total([row("EURC", 20, null), row("USDC", 0, 1, true)]), { state: "ready", figure: "20 EURC", extra: null });
});

test("a wallet of zeros reads $0.00", () => {
  assert.deepEqual(total([row("USDC", 0, 1, true), row("EURC", 0, null)]), { state: "ready", figure: "$0.00", extra: null });
});

test("no figure while a balance or a price it needs is loading", () => {
  assert.deepEqual(total(sepolia, { loading: true }), { state: "loading" }, "a balance still being read");
  const ethPending = [row("ETH", 0.0339, null, false, true), ...sepolia.slice(1)];
  assert.deepEqual(total(ethPending), { state: "loading" }, "ETH's price on its way, not $60");
  const zeroPending = [...sepolia, row("TSLA", 0, null, false, true)];
  assert.equal(total(zeroPending).state, "ready", "a price for a zero balance is not waited for");
});

test("the markets feed down: ETH is named by amount, after loading ends", () => {
  const down = [row("ETH", 0.0339, null), ...sepolia.slice(1)];
  assert.deepEqual(total(down), { state: "ready", figure: "$60", extra: "+ 20 EURC + 0.0339 ETH" });
});

test("many without a price: two named, then a count", () => {
  const rows = [row("USDC", 10, 1, true), row("EURC", 500, null), row("ETH", 0.1, null), row("GLOAM", 3, null), row("PONS", 1, null)];
  assert.deepEqual(total(rows), { state: "ready", figure: "$10", extra: "+ 500 EURC + 3 GLOAM + 2 more" });
});

test("dollars off in Settings: no total", () => {
  assert.deepEqual(total(sepolia, { showUsd: false }), { state: "off" });
});

test("a row shows its value, $0.00 for none, never the unit price", () => {
  const usdg = sepolia.find((r) => r.symbol === "USDG")!;
  assert.equal(walletRowValue(usdg, true, formatUsd), "$0.00", "a zero USDG row is $0.00, not $1.00");
  assert.equal(walletRowValue(sepolia[0], true, formatUsd), "$80", "ETH 0.0339 at $2,360");
  assert.equal(walletRowValue(sepolia[1], true, formatUsd), "$60");
  assert.equal(walletRowValue(sepolia[4], true, formatUsd), null, "EURC has no dollar line");
  assert.equal(walletRowValue(sepolia[1], false, formatUsd), null, "dollars off");
});

test("held first in the Vault's order (dollar stablecoins, then the larger value), zeros after", () => {
  const { held, empty } = splitWalletRows(sepolia);
  assert.deepEqual(held.map((r) => r.symbol), ["USDC", "ETH", "EURC"]);
  assert.deepEqual(empty.map((r) => r.symbol), ["PYUSD", "USDG"]);
  const stocks = splitWalletRows([
    row("NFLX", 2, 66),
    row("ETH", 1.2, 2360),
    row("USDG", 5000, 1, true),
    row("AMD", 40, 516.8),
    row("TSLA", 0, 372),
    row("USDC", 12, 1, true),
  ]);
  assert.deepEqual(stocks.held.map((r) => r.symbol), ["USDG", "USDC", "AMD", "ETH", "NFLX"], "by value, not by count of units");
  assert.deepEqual(stocks.empty.map((r) => r.symbol), ["TSLA"]);
});

test("every row stays in the card: held and zero together are the whole list", () => {
  const { held, empty } = splitWalletRows(sepolia);
  assert.equal(held.length + empty.length, sepolia.length);
  assert.deepEqual(splitWalletRows([row("USDC", 0, 1, true), row("EURC", 0, null)]).held, [], "all zero: nothing to lead with, so nothing folds");
});

console.log(`\n${passed} passed`);
