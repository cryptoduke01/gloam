/**
 * Ethereum Sepolia tests: the server as it will be once a release has its pool.
 *
 * The SDK builds its networks when it loads, from ETHEREUM_SEPOLIA_POOL, which
 * stays empty until the deploy (test-mainnet.mts covers the state as shipped).
 * Here it gets a placeholder pool and board before anything else loads, so this
 * file runs on its own (node --test gives each file its own process).
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * Nothing here touches a chain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
// The SDK's own mainnet module, the same file @gloamtrade/sdk loads; patched before the networks are built.
import { ETHEREUM_SEPOLIA_POOL } from "../../packages/sdk/src/mainnet.js";

Object.assign(ETHEREUM_SEPOLIA_POOL, {
  pool: "0x00000000000000000000000000000000000000e5",
  deployBlock: 300n,
  payMemo: "0x00000000000000000000000000000000000000e6",
  payMemoBlock: 301n,
});

const { ETHEREUM_SEPOLIA_PYUSD, ETHEREUM_SEPOLIA_USDC, BASE_SEPOLIA_USDC, NATIVE_ASSET, assertDepositAllowed } = await import("@gloamtrade/sdk");
const nets = await import("../src/networks.js");
const { checkSpend, loadPolicy, assetLabel } = await import("../src/policy.js");

test("Ethereum Sepolia is offered once its pool is in, after the other testnets", () => {
  assert.equal(nets.NETWORK_KEYS[nets.NETWORK_KEYS.length - 1], "ethereum");
  const n = nets.networkByKey("ethereum");
  assert.equal(n.chainId, 11155111);
  assert.equal(n.family, "ethereum");
  assert.equal(n.testnet, true);
  assert.equal(n.ceremony, "production", "the ceremony's final keys");
  assert.equal(n.nativeShield, true, "ETH is listed");
  assert.equal(n.nativeCurrency.symbol, "ETH");
  assert.equal(n.defaultAsset, ETHEREUM_SEPOLIA_USDC);
  assert.equal(n.name, "Ethereum Sepolia Testnet");
  assert.equal(nets.describeNetwork(n), "Ethereum Sepolia");
  assert.equal(n.explorer, "https://sepolia.etherscan.io");
  assert.equal(n.rpc, "https://ethereum-sepolia-rpc.publicnode.com", "an RPC at the chain head");
  assert.equal(n.historyRpc?.url, "https://sepolia.gateway.tenderly.co", "old logs and state from an RPC that keeps the whole history");
  assert.equal(nets.networkByChainId(11155111)?.key, "ethereum");
});

test("reads go to the head on publicnode, old blocks to Tenderly's gateway", async () => {
  const { getPublicClient } = await import("../src/signer.js");
  assert.equal(getPublicClient(nets.networkByKey("ethereum")).transport.type, "gloamRead", "the fresh/history split");
  assert.equal(getPublicClient(nets.networkByKey("base")).transport.type, "http", "one RPC where it keeps everything");
});

test("GLOAM_RPC_URL_11155111 and GLOAM_NETWORK=ethereum", async () => {
  process.env.GLOAM_RPC_URL_11155111 = "https://sepolia.example.test/rpc";
  const fresh = await import(`../src/networks.js?rpc=${Date.now()}`);
  assert.equal(fresh.networkByKey("ethereum").rpc, "https://sepolia.example.test/rpc");
  assert.equal(fresh.networkByKey("ethereum").historyRpc, null, "an RPC set by hand serves everything");
  delete process.env.GLOAM_RPC_URL_11155111;
  assert.equal(nets.defaultNetworkKey({ GLOAM_NETWORK: "ethereum" }), "ethereum");
  // A testnet: the Tempo access key stays on Tempo testnet.
  assert.equal(nets.tempoAccessNetwork({ GLOAM_NETWORK: "ethereum" }).chainId, nets.MCP_NETWORKS.tempo.chainId);
});

test("deposits are checked against its listed assets and limits", () => {
  assert.doesNotThrow(() => assertDepositAllowed(11155111, ETHEREUM_SEPOLIA_PYUSD, 500_000_000n));
  assert.doesNotThrow(() => assertDepositAllowed(11155111, NATIVE_ASSET, 2n * 10n ** 17n));
  assert.throws(() => assertDepositAllowed(11155111, NATIVE_ASSET, 21n * 10n ** 16n), /at most 0\.2 ETH per deposit/);
  assert.throws(() => assertDepositAllowed(11155111, BASE_SEPOLIA_USDC, 1n), /does not list/);
});

test("spending limits name Ethereum Sepolia's assets by network", () => {
  const read = () => {
    throw new Error("no file");
  };
  const loaded = loadPolicy(
    { GLOAM_LIMIT_ASSETS: "PYUSD,USDC", GLOAM_LIMIT_NETWORK: "ethereum", GLOAM_LIMIT_MAX_PER_PAYMENT: "5", GLOAM_LIMIT_MAX_PER_DAY: "10", GLOAM_LIMIT_RECIPIENTS: "any" },
    read
  );
  assert.equal(loaded.mode, "enforced");
  if (loaded.mode !== "enforced") return;
  const policy = loaded.policy;
  assert.deepEqual(policy.assets.map((a) => a.chainId), [11155111, 11155111], "both on Ethereum Sepolia");
  const spend = (asset: `0x${string}`, amountWei: bigint) => ({
    tool: "pay" as const,
    network: "ethereum" as const,
    chainId: 11155111,
    asset,
    amountWei,
    recipient: "gloamr1.payee-tag-for-tests",
  });
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(checkSpend(policy, spend(ETHEREUM_SEPOLIA_PYUSD, 5_000_000n), [], now), null);
  assert.equal(checkSpend(policy, spend(ETHEREUM_SEPOLIA_PYUSD, 5_000_001n), [], now)?.code, "over_per_payment");
  assert.equal(checkSpend(policy, spend(BASE_SEPOLIA_USDC, 1n), [], now)?.code, "asset_not_allowed", "Base Sepolia's USDC is another asset");
  assert.equal(assetLabel(11155111, ETHEREUM_SEPOLIA_PYUSD), "PYUSD");
});
