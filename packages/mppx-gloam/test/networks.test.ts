/**
 * Networks a charge can name: Base is known (its assets get labels and
 * decimals) but refused until the SDK this package is built with has its pools,
 * so a server cannot price on a chain with no official pool.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_EURC,
  BASE_SEPOLIA_EURC,
  BASE_SEPOLIA_USDC,
  BASE_USDC,
  BASE_USDT,
  baseSepoliaPool,
  mainnetPoolFor,
} from "@gloamtrade/sdk";
import { OFFICIAL_POOLS, assetDecimals, assetSymbol, resolveNetwork } from "../src/index.js";

test("Base assets have their labels and 6 decimals", () => {
  for (const [chainId, a, sym] of [
    [8453, BASE_USDC, "USDC"],
    [8453, BASE_EURC, "EURC"],
    [8453, BASE_USDT, "USDT"],
    [84532, BASE_SEPOLIA_USDC, "USDC"],
    [84532, BASE_SEPOLIA_EURC, "EURC"],
  ] as const) {
    assert.equal(assetSymbol(chainId, a), sym);
    assert.equal(assetDecimals(a), 6);
  }
  assert.equal(assetSymbol(8453, "0x0000000000000000000000000000000000000000"), "ETH");
});

test("a Base network with no pool in the SDK is refused by name, never guessed", () => {
  if (baseSepoliaPool() === null) {
    assert.throws(() => resolveNetwork("base"), /no Base testnet pool yet/);
    assert.equal(OFFICIAL_POOLS[84532], undefined);
  } else {
    assert.equal(resolveNetwork("base").chainId, 84532);
  }
  if (mainnetPoolFor(8453) === null) {
    assert.throws(() => resolveNetwork("base-mainnet"), /no Base mainnet pool yet/);
    assert.equal(OFFICIAL_POOLS[8453], undefined);
  } else {
    assert.equal(resolveNetwork("base-mainnet").currency, BASE_USDC);
  }
  assert.throws(() => resolveNetwork("solana" as never), /Unknown Gloam network/);
});
