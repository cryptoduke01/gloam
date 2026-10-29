/**
 * Self-test: which tokens the Portfolio's "In your wallet" card reads and how
 * each row's action is chosen (lib/tokens).
 *
 * A stock cashed out of the vault to the wallet (TSLA on Robinhood Chain
 * mainnet) did not show in "In your wallet": the card read only the tokens Add
 * takes (USDG, GLOAM). It now reads those plus the chain's swap tokens, deduped
 * by address with the addable ones first, but only the addable ones offer
 * "Add privately", so what Add lists is unchanged.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-wallet-tokens.mts
 */
import assert from "node:assert/strict";
import {
  RH_MAINNET_SWAP_TOKENS,
  RH_MAINNET_TOKENS,
  TESTNET_STOCK_TOKENS,
  addableTokensFor,
  hasUiMultiplier,
  isAddableToken,
  limitGatedTokensFor,
  openGatedFromReads,
  shieldTokensFor,
  swapDisplayTokensFor,
  walletDisplayTokensFor,
} from "../src/lib/tokens";

let n = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const RH = 4663;
const tsla = RH_MAINNET_SWAP_TOKENS.find((t) => t.id === "tsla")!;
const usdg = RH_MAINNET_TOKENS.find((t) => t.id === "usdg")!;

check("Robinhood mainnet wallet card reads the addable tokens first, then the swap tokens", () => {
  const list = walletDisplayTokensFor(RH);
  assert.deepEqual(list.slice(0, RH_MAINNET_TOKENS.length), RH_MAINNET_TOKENS);
  assert.equal(list.length, RH_MAINNET_TOKENS.length + RH_MAINNET_SWAP_TOKENS.length);
  assert.ok(list.some((t) => t.id === "tsla"));
  assert.ok(list.some((t) => t.id === "weth"));
});

check("no address twice, compared without case", () => {
  const list = walletDisplayTokensFor(RH);
  assert.equal(new Set(list.map((t) => t.address.toLowerCase())).size, list.length);
});

check("what Add offers does not change", () => {
  assert.deepEqual(shieldTokensFor(RH), RH_MAINNET_TOKENS);
  assert.equal(isAddableToken(RH, usdg), true);
  assert.equal(isAddableToken(RH, tsla), false);
  assert.equal(isAddableToken(RH, { address: tsla.address.toLowerCase() as `0x${string}` }), false);
  assert.equal(isAddableToken(RH, { address: usdg.address.toLowerCase() as `0x${string}` }), true);
});

check("a chain with no swap tokens reads exactly what Add lists", () => {
  for (const id of [1, 8453, 84532, 4217, 42431, 11155111, 46630]) {
    assert.deepEqual(swapDisplayTokensFor(id), []);
    assert.deepEqual(walletDisplayTokensFor(id), shieldTokensFor(id));
  }
});

check("the mainnet stocks carry a uiMultiplier; the testnet stocks, WETH and stablecoins do not", () => {
  assert.equal(hasUiMultiplier(RH, tsla), true);
  assert.equal(hasUiMultiplier(RH, RH_MAINNET_SWAP_TOKENS.find((t) => t.id === "weth")!), false);
  assert.equal(hasUiMultiplier(RH, usdg), false);
  const testnetStock = TESTNET_STOCK_TOKENS[0]!;
  assert.equal(hasUiMultiplier(46630, testnetStock), false);
  assert.equal(hasUiMultiplier(RH, testnetStock), false);
});

// BDX on Base and Ethereum is listed ahead of its deposit limit, which goes
// through the vault's 3-day timelock: Add offers it only once the live limit
// reads open, while the wallet card, names and balances know it all along.
const BDX = "0x6ad12E761b438beA3EA09F6C6266556Bb24C2181";
const bdxLower = BDX.toLowerCase();

check("BDX is listed on Base and Ethereum, gated by its live limit, and nowhere else", () => {
  for (const id of [8453, 1]) {
    const gated = limitGatedTokensFor(id);
    assert.deepEqual(gated.map((t) => [t.symbol, t.address, t.decimals, t.kind, t.coingecko]), [["BDX", BDX, 9, "token", "beldex"]]);
    assert.ok(shieldTokensFor(id).some((t) => t.id === "bdx"), "known to the chain's list");
    assert.ok(walletDisplayTokensFor(id).some((t) => t.id === "bdx"), "the wallet card reads it");
  }
  for (const id of [4663, 4217, 84532, 11155111, 46630, 42431]) assert.deepEqual(limitGatedTokensFor(id), []);
});

check("Add leaves BDX out until its limit is read open", () => {
  for (const id of [8453, 1]) {
    const bdx = shieldTokensFor(id).find((t) => t.id === "bdx")!;
    assert.ok(!addableTokensFor(id).some((t) => t.id === "bdx"), "no reads: not offered");
    assert.ok(!addableTokensFor(id, new Set()).some((t) => t.id === "bdx"), "read closed: not offered");
    assert.equal(isAddableToken(id, bdx), false);
    assert.equal(isAddableToken(id, bdx, new Set([bdxLower])), true);
    assert.ok(addableTokensFor(id, new Set([bdxLower])).some((t) => t.id === "bdx"), "read open: offered");
    // the rest of the list is untouched either way
    assert.deepEqual(
      addableTokensFor(id).map((t) => t.id),
      shieldTokensFor(id).filter((t) => t.id !== "bdx").map((t) => t.id)
    );
  }
});

check("the live reads open BDX only with a limit above 0, and never while unread", () => {
  const gated = limitGatedTokensFor(8453);
  const per = 100_000n * 10n ** 9n;
  const total = 2_000_000n * 10n ** 9n;
  assert.equal(openGatedFromReads(gated, undefined, [[per, total]]).size, 0, "depositLimitsOn unread");
  assert.equal(openGatedFromReads(gated, true, [undefined]).size, 0, "the limit unread");
  assert.equal(openGatedFromReads(gated, true, [[0n, 0n]]).size, 0, "queued, not landed: 0 / 0");
  assert.equal(openGatedFromReads(gated, true, [[0n, total]]).size, 0, "a zero per-deposit limit takes nothing");
  assert.deepEqual([...openGatedFromReads(gated, true, [[per, total]])], [bdxLower], "landed");
  assert.deepEqual([...openGatedFromReads(gated, false, [undefined])], [bdxLower], "a pool with no limits takes it");
});

console.log(`selftest-wallet-tokens: ${n} checks passed`);
