/**
 * Ethereum Sepolia in a charge: its assets get their labels and decimals, and
 * the network is refused by name until the SDK this package is built with has
 * its pool, so a server cannot price on a chain with no official pool.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETHEREUM_SEPOLIA_EURC,
  ETHEREUM_SEPOLIA_PYUSD,
  ETHEREUM_SEPOLIA_USDC,
  ETHEREUM_SEPOLIA_USDG,
  ethereumSepoliaPool,
} from "@gloamtrade/sdk";
import { OFFICIAL_POOLS, assetDecimals, assetSymbol, resolveNetwork } from "../src/index.js";

test("Ethereum Sepolia assets have their labels and 6 decimals", () => {
  for (const [a, sym] of [
    [ETHEREUM_SEPOLIA_USDC, "USDC"],
    [ETHEREUM_SEPOLIA_USDG, "USDG"],
    [ETHEREUM_SEPOLIA_PYUSD, "PYUSD"],
    [ETHEREUM_SEPOLIA_EURC, "EURC"],
  ] as const) {
    assert.equal(assetSymbol(11155111, a), sym);
    assert.equal(assetDecimals(a), 6);
  }
  assert.equal(assetSymbol(11155111, "0x0000000000000000000000000000000000000000"), "ETH");
});

test("Ethereum Sepolia with no pool in the SDK is refused by name, never guessed", () => {
  const p = ethereumSepoliaPool();
  if (p === null) {
    assert.throws(() => resolveNetwork("ethereum"), /no Ethereum Sepolia pool yet/);
    assert.equal(OFFICIAL_POOLS[11155111], undefined);
  } else {
    const r = resolveNetwork("ethereum");
    assert.equal(r.chainId, 11155111);
    assert.equal(r.currency, ETHEREUM_SEPOLIA_USDC);
    assert.equal(OFFICIAL_POOLS[11155111], p.pool);
  }
});
