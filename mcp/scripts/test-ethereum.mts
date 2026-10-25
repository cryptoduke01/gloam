/**
 * Ethereum tests: the server as it will be once a release has the Ethereum pool.
 *
 * The SDK builds its networks when it loads, from MAINNET_POOLS, where chain 1
 * is still null (test-mainnet.mts covers that state). Here it gets a
 * placeholder pool before anything else loads, so this file runs on its own
 * (node --test gives each file its own process).
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * Nothing here touches a chain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// The SDK's own mainnet module, the same file @gloamtrade/sdk loads; patched before the networks are built.
import { MAINNET_POOLS } from "../../packages/sdk/src/mainnet.js";
import type { Spend } from "../src/policy.js";

MAINNET_POOLS[1] = { pool: "0x00000000000000000000000000000000000000e1", deployBlock: 23_000_000n };

const { ETHEREUM_PYUSD, ETHEREUM_USDC, ETHEREUM_USDT, BASE_USDT, NATIVE_ASSET, assertDepositAllowed, approvalSteps } = await import("@gloamtrade/sdk");
const nets = await import("../src/networks.js");
const { checkSpend, loadPolicy, resolveAgent } = await import("../src/policy.js");

const NOW = Date.UTC(2026, 9, 26, 12);
const PAYEE = "0x00000000000000000000000000000000000000aa";
const spend = (over: Partial<Spend>): Spend => ({
  tool: "pay",
  network: "ethereum-mainnet",
  chainId: 1,
  asset: ETHEREUM_USDC,
  amountWei: 1_000_000n,
  recipient: PAYEE,
  ...over,
});

test("Ethereum is offered with the mainnets once its pool is in", () => {
  const keys = nets.NETWORK_KEYS;
  assert.ok(keys.includes("ethereum-mainnet"));
  assert.ok(keys.indexOf("ethereum-mainnet") < keys.indexOf("robinhood"), "with the mainnets, before the testnets");
  const n = nets.networkByKey("ethereum-mainnet");
  assert.equal(n.chainId, 1);
  assert.equal(n.family, "ethereum");
  assert.equal(n.testnet, false);
  assert.equal(n.ceremony, "production", "the ceremony's final keys");
  assert.equal(n.nativeShield, true, "ETH is listed");
  assert.equal(n.nativeCurrency.symbol, "ETH");
  assert.equal(n.defaultAsset, ETHEREUM_USDC);
  assert.equal(n.name, "Ethereum Mainnet");
  assert.equal(nets.describeNetwork(n), "Ethereum mainnet (real money)");
  assert.equal(n.explorer, "https://etherscan.io");
  assert.equal(n.rpc, "https://rpc.mevblocker.io", "an RPC that keeps old logs");
  assert.equal(nets.networkByChainId(1)?.key, "ethereum-mainnet");
});

test("GLOAM_NETWORK takes ethereum-mainnet, the access key goes to Tempo mainnet, and GLOAM_RPC_URL_1 is read", () => {
  assert.equal(nets.defaultNetworkKey({ GLOAM_NETWORK: "ethereum-mainnet" }), "ethereum-mainnet");
  assert.equal(nets.tempoAccessNetwork({ GLOAM_NETWORK: "ethereum-mainnet" }).chainId, 4217);
  assert.throws(() => nets.defaultNetworkKey({ GLOAM_NETWORK: "ethereum" }), /not a Gloam network/);
  const src = readFileSync(new URL("../src/networks.ts", import.meta.url), "utf8");
  assert.match(src, /GLOAM_RPC_URL_\$\{chainId\}/, "any chain id, 1 included");
});

test("deposits on Ethereum are checked against its listed assets and limits", () => {
  assert.doesNotThrow(() => assertDepositAllowed(1, ETHEREUM_PYUSD, 500_000_000n));
  assert.throws(() => assertDepositAllowed(1, ETHEREUM_USDT, 500_000_001n), /at most 500 USDT per deposit/);
  assert.doesNotThrow(() => assertDepositAllowed(1, NATIVE_ASSET, 2n * 10n ** 17n));
  assert.throws(() => assertDepositAllowed(1, NATIVE_ASSET, 2n * 10n ** 17n + 1n), /at most 0\.2 ETH per deposit/);
  assert.throws(() => assertDepositAllowed(1, BASE_USDT, 1n), /does not list/);
});

test("a stale USDT allowance is cleared before the shield's approval", () => {
  assert.deepEqual(approvalSteps(1, ETHEREUM_USDT, 7n, 100n), [0n, 100n]);
  assert.deepEqual(approvalSteps(1, ETHEREUM_USDC, 7n, 100n), [100n]);
  const src = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(src, /approveNeedsReset\(net\.chainId, assetAddr\)/, "the shield tool checks it");
});

test("Ethereum in limits: name the network; PYUSD and Ethereum addresses are mainnet already", () => {
  const real = resolveAgent(
    "bot",
    {
      recipients: [PAYEE],
      assets: {
        USDC: { network: "ethereum-mainnet", maxPerPayment: "5", maxPerDay: "10" },
        USDT: { network: "ethereum-mainnet", maxPerPayment: "5", maxPerDay: "10" },
        ETH: { network: "ethereum-mainnet", maxPerPayment: "0.01", maxPerDay: "0.05" },
        PYUSD: { maxPerPayment: "3", maxPerDay: "6" },
      },
    },
    "test"
  );
  const [usdc, usdt, ethAsset, pyusd] = real.assets;
  assert.deepEqual([usdc!.address, usdc!.chainId], [ETHEREUM_USDC, 1]);
  assert.deepEqual([usdt!.address, usdt!.chainId], [ETHEREUM_USDT, 1]);
  assert.deepEqual([ethAsset!.address, ethAsset!.chainId, ethAsset!.decimals], [NATIVE_ASSET, 1, 18]);
  assert.deepEqual([pyusd!.address, pyusd!.chainId], [ETHEREUM_PYUSD, 1], "PYUSD is on Ethereum only");
  assert.equal(checkSpend(real, spend({}), [], NOW), null);
  assert.equal(checkSpend(real, spend({ amountWei: 6_000_000n }), [], NOW)?.code, "over_per_payment");
  // Ethereum's USDT entry does not open Base's USDT
  assert.equal(checkSpend(real, spend({ network: "base-mainnet", chainId: 8453, asset: BASE_USDT }), [], NOW)?.code, "asset_not_allowed");

  // "USDT" alone still names Base's, as before Ethereum was added
  const plain = resolveAgent("bot", { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: ["USDT"] }, "test");
  assert.equal(plain.assets[0]!.chainId, 8453);
  // an Ethereum address names Ethereum
  const byAddr = resolveAgent("bot", { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: [ETHEREUM_USDC] }, "test");
  assert.deepEqual([byAddr.assets[0]!.chainId, byAddr.assets[0]!.decimals], [1, 6]);

  const read = (p: string) => readFileSync(p, "utf8");
  const env = { GLOAM_LIMIT_MAX_PER_PAYMENT: "5", GLOAM_LIMIT_MAX_PER_DAY: "10", GLOAM_LIMIT_RECIPIENTS: "any" };
  const inline = loadPolicy({ ...env, GLOAM_LIMIT_ASSETS: "USDC,USDT,USDG,PYUSD,EURC,ETH", GLOAM_LIMIT_NETWORK: "ethereum-mainnet" }, read);
  assert.equal(inline.mode, "enforced");
  if (inline.mode === "enforced") assert.deepEqual(inline.policy.assets.map((a) => a.chainId), [1, 1, 1, 1, 1, 1]);
  const bad = loadPolicy({ ...env, GLOAM_LIMIT_ASSETS: "USDC", GLOAM_LIMIT_NETWORK: "ethereum" }, read);
  assert.equal(bad.mode, "invalid");
  if (bad.mode === "invalid") assert.match(bad.error, /ethereum-mainnet/);
});
