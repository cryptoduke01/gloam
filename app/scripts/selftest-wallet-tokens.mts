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
  hasUiMultiplier,
  isAddableToken,
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

console.log(`selftest-wallet-tokens: ${n} checks passed`);
