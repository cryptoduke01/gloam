/**
 * Self-test: the Wallet X-ray's input rule and the facts it derives from a
 * wallet's Transfer logs (lib/xray/input, lib/xray/history). No chain, no
 * network: every figure the receipt can show is checked against logs written
 * out by hand, including the cases where a figure has to be left out.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-xray.mts
 */
import assert from "node:assert/strict";
import { zeroAddress } from "viem";
import { dedupeTransfers, factsFrom, spansFrom, stockTxs, type XrayToken, type XrayTransfer } from "../src/lib/xray/history";
import { parseXrayQuery, shortAddress } from "../src/lib/xray/input";

let n = 0;
const eq = (a: unknown, b: unknown, msg?: string) => {
  assert.deepEqual(a, b, msg);
  n++;
};

/* ------------------------------------------------------------------ input */

const CHECKSUMMED = "0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8";
eq(parseXrayQuery(CHECKSUMMED), { kind: "address", address: CHECKSUMMED });
eq(parseXrayQuery(`  ${CHECKSUMMED}\n`), { kind: "address", address: CHECKSUMMED }, "pasted with spaces");
eq(parseXrayQuery(CHECKSUMMED.toLowerCase()), { kind: "address", address: CHECKSUMMED }, "all lowercase has no checksum to fail");
eq(parseXrayQuery(CHECKSUMMED.replace("b7E", "B7e")), { kind: "invalid" }, "a bad checksum is a typo, not another wallet");
eq(parseXrayQuery("vitalik.eth"), { kind: "ens", name: "vitalik.eth" });
eq(parseXrayQuery(" Vitalik.ETH "), { kind: "ens", name: "vitalik.eth" });
eq(parseXrayQuery("pay.vitalik.eth"), { kind: "ens", name: "pay.vitalik.eth" });
for (const bad of [
  "",
  "   ",
  "0x",
  "0x123",
  `${CHECKSUMMED}00`,
  "eth",
  ".eth",
  "vitalik",
  "vitalik.com",
  "-a.eth",
  "a-.eth",
  "a b.eth",
  "../../etc/passwd",
  "<script>.eth",
  `${"a".repeat(101)}.eth`,
  null,
  undefined,
  42,
  {},
]) {
  eq(parseXrayQuery(bad), { kind: "invalid" }, `refused: ${String(bad)}`);
}
eq(shortAddress(CHECKSUMMED), "0x76b7…D4D8");

/* ------------------------------------------------------------------ facts */

const WALLET = "0x00000000000000000000000000000000000000aa";
const ALICE = "0x00000000000000000000000000000000000000a1";
const BOB = "0x00000000000000000000000000000000000000b0";
const POOL = "0x00000000000000000000000000000000000000c0";
const USDG = "0x0000000000000000000000000000000000000001";
const TSLA = "0x0000000000000000000000000000000000000002";
const NVDA = "0x0000000000000000000000000000000000000003";
const ODD = "0x0000000000000000000000000000000000000004";

const list: XrayToken[] = [
  { address: USDG, symbol: "USDG", decimals: 0, stock: false },
  { address: TSLA, symbol: "TSLA", decimals: 0, stock: true },
  { address: NVDA, symbol: "NVDA", decimals: 0, stock: true },
  { address: ODD, symbol: "ODD", decimals: 0, stock: false },
];
const tokens = new Map(list.map((t) => [t.address, t]));
/** One token is one dollar here, TSLA is ten, and ODD has no price. */
const usdOf = (r: XrayTransfer) => ({
  usd: r.token === ODD ? null : Number(r.value) * (r.token === TSLA ? 10 : 1),
  amount: String(r.value),
});

let index = 0;
const move = (token: string, from: string, to: string, value: bigint, block: bigint, tx = `0xt${index}`): XrayTransfer => ({
  token,
  from,
  to,
  value,
  block,
  tx,
  logIndex: index++,
});
const facts = (rows: XrayTransfer[]) => factsFrom(WALLET, rows, tokens, usdOf);

// nothing at all: no figure is invented
eq(facts([]), {
  transfers: 0,
  firstBlock: null,
  lastBlock: null,
  counterparties: 0,
  stockTrades: 0,
  stocksTraded: [],
});

// an ordinary wallet, handed in out of order
{
  const f = facts([
    move(USDG, WALLET, BOB, 40n, 300n),
    move(USDG, ALICE, WALLET, 100n, 100n),
    move(USDG, WALLET, BOB, 5n, 400n),
    move(USDG, BOB, WALLET, 7n, 200n),
  ]);
  eq(f.transfers, 4);
  eq([f.firstBlock, f.lastBlock], [100n, 400n]);
  eq(f.firstFunder, { address: ALICE, amount: "100", symbol: "USDG", block: 100n }, "the earliest arrival, not the first log handed in");
  eq(f.biggestIn, { usd: 100, amount: "100", symbol: "USDG", counterparty: ALICE });
  eq(f.biggestOut, { usd: 40, amount: "40", symbol: "USDG", counterparty: BOB });
  eq(f.counterparties, 2);
  eq(f.topCounterparty, { address: BOB, transfers: 3 });
  eq(f.stockTrades, 0);
}

// a wallet paying itself: one log, read from both sides, and no counterparty
{
  const self = move(USDG, WALLET, WALLET, 50n, 10n);
  eq(dedupeTransfers([self, self]).length, 1);
  const f = facts([self, self]);
  eq(f.transfers, 1);
  eq(f.counterparties, 0);
  eq(f.biggestIn, undefined);
  eq(f.biggestOut, undefined);
  eq(f.firstFunder, undefined, "its own money did not fund it");
}

// a mint first: nobody funded it that we can name, so the row is left out rather than moved on to the second arrival
{
  const f = facts([move(USDG, zeroAddress, WALLET, 500n, 10n), move(USDG, ALICE, WALLET, 1n, 20n)]);
  eq(f.firstFunder, undefined);
  eq(f.biggestIn, { usd: 500, amount: "500", symbol: "USDG", counterparty: null }, "a mint has no counterparty");
  eq(f.counterparties, 1, "the zero address is not a wallet");
}

// a token with no price can never be called the biggest
{
  const f = facts([move(ODD, ALICE, WALLET, 9_000_000n, 10n), move(USDG, ALICE, WALLET, 3n, 20n)]);
  eq(f.biggestIn?.symbol, "USDG");
  eq(f.firstFunder?.symbol, "ODD", "the first arrival still counts, priced or not");
}

// a buy, a sell, and a stock to stock swap are one trade each
{
  const f = facts([
    move(USDG, WALLET, POOL, 100n, 10n, "0xbuy"),
    move(TSLA, POOL, WALLET, 10n, 10n, "0xbuy"),
    move(TSLA, WALLET, POOL, 4n, 20n, "0xsell"),
    move(USDG, POOL, WALLET, 40n, 20n, "0xsell"),
    move(TSLA, WALLET, POOL, 1n, 30n, "0xswap"),
    move(NVDA, POOL, WALLET, 1n, 30n, "0xswap"),
  ]);
  eq(f.stockTrades, 3);
  eq(f.stocksTraded, ["TSLA", "NVDA"], "most traded first");
}

// a stock moving with nothing against it is a transfer, not a trade
{
  const f = facts([
    move(TSLA, ALICE, WALLET, 1n, 10n, "0xgift"),
    move(TSLA, WALLET, BOB, 1n, 20n, "0xsent"),
    // through the wallet and out again in one transaction: no net move
    move(TSLA, ALICE, WALLET, 1n, 30n, "0xpass"),
    move(TSLA, WALLET, BOB, 1n, 30n, "0xpass"),
    move(USDG, WALLET, BOB, 1n, 30n, "0xpass"),
    // the stock and the other token both coming in: nothing was paid
    move(TSLA, ALICE, WALLET, 1n, 40n, "0xboth"),
    move(USDG, ALICE, WALLET, 1n, 40n, "0xboth"),
  ]);
  eq(f.stockTrades, 0);
  eq(f.stocksTraded, []);
}

// a trade settled in a token off the list: the receipt shows it, and it counts towards nothing else
{
  const OFF_LIST = "0x00000000000000000000000000000000000000f0";
  const bought = move(TSLA, POOL, WALLET, 1n, 10n, "0xoff");
  const paid = move(OFF_LIST, WALLET, POOL, 900n, 10n, "0xoff");
  const gift = move(TSLA, ALICE, WALLET, 1n, 20n, "0xgift2");
  eq(stockTxs([gift, bought], tokens), ["0xoff", "0xgift2"], "oldest first, each transaction once");
  eq(facts([bought]).stockTrades, 0, "with only the stock read, no trade can be claimed");
  const f = factsFrom(WALLET, [bought, gift], tokens, usdOf, [paid]);
  eq(f.stockTrades, 1);
  eq(f.stocksTraded, ["TSLA"]);
  eq(f.transfers, 2, "receipt moves are not transfers of the listed tokens");
  eq(f.counterparties, 2, "POOL and ALICE, from the rows alone");
  eq(f.biggestOut, undefined, "a token with no list entry can not be the biggest anything");
}

/* ------------------------------------------------------------------ spans */

eq(spansFrom(0n, 9_999_999n), [[0n, 9_999_999n]], "exactly the widest query the RPC takes");
eq(spansFrom(0n, 10_000_000n), [[0n, 9_999_999n], [10_000_000n, 10_000_000n]], "one block over starts another");
eq(spansFrom(5n, 5n), [[5n, 5n]]);
eq(spansFrom(6n, 5n), [], "nothing to read");
{
  const spans = spansFrom(39_918_259n, 101_900_000n);
  eq(spans[0]![0], 39_918_259n);
  eq(spans[spans.length - 1]![1], 101_900_000n);
  for (const [a, b] of spans) assert.ok(b - a + 1n <= 10_000_000n, "no span over the limit");
  for (let i = 1; i < spans.length; i++) eq(spans[i]![0], spans[i - 1]![1] + 1n, "no gap and no overlap");
}

console.log(`selftest-xray: ${n} checks passed`);
