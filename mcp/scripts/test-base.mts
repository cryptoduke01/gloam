/**
 * Base tests: the server as it will be once a release has the Base pools.
 *
 * The SDK builds its networks when it loads, from MAINNET_POOLS and
 * BASE_SEPOLIA_POOL. Base Sepolia's is in; Base mainnet's is still null
 * (test-mainnet.mts covers the state as shipped). Here both get placeholder
 * pools before anything else loads, so this file runs on its own (node --test
 * gives each file its own process).
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * Nothing here touches a chain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
// The SDK's own mainnet module, the same file @gloamtrade/sdk loads; patched before the networks are built.
import { BASE_SEPOLIA_POOL, MAINNET_POOLS } from "../../packages/sdk/src/mainnet.js";

MAINNET_POOLS[8453] = { pool: "0x00000000000000000000000000000000000000b5", deployBlock: 100n };
BASE_SEPOLIA_POOL.pool = "0x00000000000000000000000000000000000000b6";
BASE_SEPOLIA_POOL.deployBlock = 200n;

const { BASE_SEPOLIA_USDC, BASE_USDC, NATIVE_ASSET, assertDepositAllowed } = await import("@gloamtrade/sdk");
const nets = await import("../src/networks.js");

test("both Base networks are offered once their pools are in", () => {
  assert.deepEqual(nets.NETWORK_KEYS.slice(-3), ["robinhood", "tempo", "base"], "Base Sepolia after the older testnets");
  assert.ok(nets.NETWORK_KEYS.indexOf("base-mainnet") < nets.NETWORK_KEYS.indexOf("robinhood"), "Base mainnet with the mainnets");
  const main = nets.networkByKey("base-mainnet");
  const test = nets.networkByKey("base");
  assert.equal(main.chainId, 8453);
  assert.equal(test.chainId, 84532);
  for (const n of [main, test]) {
    assert.equal(n.family, "base");
    assert.equal(n.ceremony, "production", `${n.key}: the ceremony's final keys`);
    assert.equal(n.nativeShield, true, `${n.key}: ETH is listed`);
    assert.equal(n.nativeCurrency.symbol, "ETH");
    assert.match(n.rpc, /publicnode\.com$/, `${n.key}: an RPC that serves eth_getLogs`);
  }
  assert.equal(main.testnet, false);
  assert.equal(test.testnet, true);
  assert.equal(main.defaultAsset, BASE_USDC);
  assert.equal(test.defaultAsset, BASE_SEPOLIA_USDC);
  assert.equal(main.name, "Base Mainnet");
  assert.equal(test.name, "Base Sepolia Testnet");
  assert.equal(nets.describeNetwork(main), "Base mainnet");
  assert.equal(nets.describeNetwork(test), "Base testnet");
  assert.equal(main.explorer, "https://basescan.org");
  assert.equal(test.explorer, "https://sepolia.basescan.org");
  assert.equal(nets.networkByChainId(84532)?.key, "base");
});

test("GLOAM_NETWORK takes the Base keys, and access keys stay on Tempo", () => {
  assert.equal(nets.defaultNetworkKey({ GLOAM_NETWORK: "base" }), "base");
  assert.equal(nets.defaultNetworkKey({ GLOAM_NETWORK: "base-mainnet" }), "base-mainnet");
  // Base Sepolia is a testnet: the access key stays on Tempo testnet. Base mainnet: Tempo mainnet.
  assert.equal(nets.tempoAccessNetwork({ GLOAM_NETWORK: "base" }).chainId, nets.MCP_NETWORKS.tempo.chainId);
  assert.equal(nets.tempoAccessNetwork({ GLOAM_NETWORK: "base-mainnet" }).chainId, 4217);
});

test("deposits on Base Sepolia are checked against its listed assets and limits", () => {
  assert.doesNotThrow(() => assertDepositAllowed(84532, NATIVE_ASSET, 2n * 10n ** 17n));
  assert.throws(() => assertDepositAllowed(84532, NATIVE_ASSET, 21n * 10n ** 16n), /at most 0\.2 ETH per deposit/);
  assert.throws(() => assertDepositAllowed(84532, BASE_USDC, 1n), /does not list/);
});
