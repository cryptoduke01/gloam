/**
 * Ethereum as a charge network: its assets get labels and decimals, and it is
 * refused until the SDK this package is built with has its pool, so a server
 * cannot price on a chain with no official pool.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETHEREUM_EURC,
  ETHEREUM_PYUSD,
  ETHEREUM_USDC,
  ETHEREUM_USDG,
  ETHEREUM_USDT,
  mainnetPoolFor,
} from "@gloamtrade/sdk";
import { OFFICIAL_POOLS, assetDecimals, assetSymbol, resolveNetwork } from "../src/index.js";

test("Ethereum assets have their labels and 6 decimals", () => {
  for (const [a, sym] of [
    [ETHEREUM_USDC, "USDC"],
    [ETHEREUM_USDT, "USDT"],
    [ETHEREUM_USDG, "USDG"],
    [ETHEREUM_PYUSD, "PYUSD"],
    [ETHEREUM_EURC, "EURC"],
  ] as const) {
    assert.equal(assetSymbol(1, a), sym);
    assert.equal(assetDecimals(a), 6);
  }
  assert.equal(assetSymbol(1, "0x0000000000000000000000000000000000000000"), "ETH");
});

test("Ethereum with no pool in the SDK is refused by name, never guessed", () => {
  if (mainnetPoolFor(1) === null) {
    assert.throws(() => resolveNetwork("ethereum-mainnet"), /no Ethereum mainnet pool yet/);
    assert.equal(OFFICIAL_POOLS[1], undefined);
  } else {
    assert.equal(resolveNetwork("ethereum-mainnet").currency, ETHEREUM_USDC);
  }
});
