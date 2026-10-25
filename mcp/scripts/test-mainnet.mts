/**
 * Mainnet tests: which networks this build offers, how a mainnet is named in
 * limits, that a testnet config never approves mainnet assets by itself, the key
 * set each network proves with, and that a price on a chain this build has no
 * pool for is refused.
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * Nothing here touches a chain. Mainnet pools come from the SDK's MAINNET_POOLS;
 * before deploy day they are null, and these tests cover that state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseUnits, type Address } from "viem";
import {
  BASE_SEPOLIA_EURC,
  BASE_SEPOLIA_USDC,
  BASE_USDC,
  BASE_USDT,
  GLOAM_NETWORKS,
  GLOAM_TOKEN,
  NATIVE_ASSET,
  RH_MAINNET_USDG,
  RH_USDG,
  TEMPO_PATHUSD,
  TEMPO_USDCE,
  baseSepoliaPool,
  circuitArtifactFiles,
  mainnetPoolFor,
} from "@gloamtrade/sdk";
import { checkSpend, loadPolicy, resolveAgent, type Spend } from "../src/policy.js";
import { MCP_MAINNETS, MCP_NETWORKS, NETWORK_KEYS, allNetworks, defaultNetworkKey, networkByChainId, tempoAccessNetwork } from "../src/networks.js";
import { parseFlags } from "../src/cli.js";

const read = (p: string) => readFileSync(p, "utf8");
const NOW = Date.parse("2026-10-21T14:00:00Z");
const PAYEE = "gloamr1.payee-tag-for-tests";

const spend = (over: Partial<Spend>): Spend => ({
  tool: "pay",
  network: "robinhood-mainnet",
  chainId: 4663,
  asset: RH_MAINNET_USDG,
  amountWei: parseUnits("1", 6),
  recipient: PAYEE,
  ...over,
});

test("networks: older testnets always; a mainnet or Base Sepolia only once the SDK has its pool", () => {
  const rhLive = mainnetPoolFor(4663) !== null;
  const tempoLive = mainnetPoolFor(4217) !== null;
  const baseLive = mainnetPoolFor(8453) !== null;
  const baseTestLive = baseSepoliaPool() !== null;
  assert.equal(MCP_MAINNETS.length, Number(rhLive) + Number(tempoLive) + Number(baseLive));
  const firstTest = NETWORK_KEYS.indexOf("robinhood");
  assert.deepEqual(NETWORK_KEYS.slice(firstTest), ["robinhood", "tempo", ...(baseTestLive ? ["base"] : [])], "testnets last");
  assert.equal(NETWORK_KEYS.includes("robinhood-mainnet"), rhLive);
  assert.equal(NETWORK_KEYS.includes("tempo-mainnet"), tempoLive);
  assert.equal(NETWORK_KEYS.includes("base-mainnet"), baseLive);
  assert.equal(NETWORK_KEYS.includes("base"), baseTestLive);
  for (const n of allNetworks()) {
    // Base Sepolia runs the mainnet pool, so it proves with the final keys too.
    assert.equal(n.ceremony, n.testnet && n.family !== "base" ? "dev" : "production", `${n.key} proves with the right keys`);
    if (!n.testnet) {
      assert.equal(n.nativeShield, n.family === "base", `${n.key}: native deposits only on Base`);
      assert.notEqual(n.defaultAsset, "0x0000000000000000000000000000000000000000");
    }
  }
  if (!baseLive) assert.equal(networkByChainId(8453), undefined, "no Base pool, no Base mainnet");
  if (!baseTestLive) assert.equal(networkByChainId(84532), undefined, "no Base Sepolia pool, no Base Sepolia");
  assert.equal(MCP_NETWORKS.tempo.chainId, GLOAM_NETWORKS.tempo.chainId);
  if (!rhLive) assert.equal(networkByChainId(4663), undefined, "no pool, no network");
});

test("GLOAM_NETWORK picks the default network, and a missing or wrong one fails loudly", () => {
  assert.equal(defaultNetworkKey({}), "robinhood");
  assert.equal(defaultNetworkKey({ GLOAM_NETWORK: "tempo" }), "tempo");
  assert.throws(() => defaultNetworkKey({ GLOAM_NETWORK: "mainnet" }), /not a Gloam network/);
  if (mainnetPoolFor(4217) === null) {
    assert.throws(() => defaultNetworkKey({ GLOAM_NETWORK: "tempo-mainnet" }), /no tempo-mainnet pool yet/);
  } else {
    assert.equal(defaultNetworkKey({ GLOAM_NETWORK: "tempo-mainnet" }), "tempo-mainnet");
    assert.equal(tempoAccessNetwork({ GLOAM_NETWORK: "tempo-mainnet" }).chainId, 4217);
  }
  assert.equal(tempoAccessNetwork({}).chainId, GLOAM_NETWORKS.tempo.chainId, "access keys default to Tempo testnet");
  if (baseSepoliaPool() === null) assert.throws(() => defaultNetworkKey({ GLOAM_NETWORK: "base" }), /no base pool yet/);
  if (mainnetPoolFor(8453) === null) assert.throws(() => defaultNetworkKey({ GLOAM_NETWORK: "base-mainnet" }), /no base-mainnet pool yet/);
});

test("mainnet proofs use the final keys, kept apart from the dev keys", () => {
  const dev = circuitArtifactFiles("transfer", "dev");
  const fin = circuitArtifactFiles("transfer", "production");
  assert.equal(dev.zkey, "transfer_final.zkey");
  assert.equal(fin.zkey, "final/transfer_final.zkey");
  assert.equal(dev.wasm, fin.wasm, "one wasm for both key sets");
  assert.notEqual(dev.sha256.zkey, fin.sha256.zkey);
});

test("a testnet limits config never approves mainnet assets by itself", () => {
  // "USDG" alone is the testnet USDG.
  const testnetOnly = resolveAgent("bot", { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: ["USDG"] }, "test");
  assert.equal(testnetOnly.assets[0]!.address, RH_USDG);
  assert.equal(testnetOnly.assets[0]!.chainId, GLOAM_NETWORKS.robinhood.chainId);
  const r = checkSpend(testnetOnly, spend({}), [], NOW);
  assert.equal(r?.code, "asset_not_allowed");
  assert.match(r!.message, /USDG on Robinhood Chain is not one of this agent's assets/);
  // pathUSD shares its address on both Tempo networks: an address alone means the testnet too.
  const byAddress = resolveAgent("bot", { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: [TEMPO_PATHUSD] }, "test");
  assert.equal(byAddress.assets[0]!.chainId, GLOAM_NETWORKS.tempo.chainId);
  assert.equal(checkSpend(byAddress, spend({ network: "tempo-mainnet", chainId: 4217, asset: TEMPO_PATHUSD }), [], NOW)?.code, "asset_not_allowed");
});

test("naming a mainnet network in limits allows exactly that asset there", () => {
  const p = resolveAgent(
    "bot",
    {
      recipients: [PAYEE],
      assets: {
        USDG: { network: "robinhood-mainnet", maxPerPayment: "5", maxPerDay: "10" },
        pathUSD: { network: "tempo-mainnet", maxPerPayment: "2", maxPerDay: "4" },
        "USDC.e": { maxPerPayment: "3", maxPerDay: "6" },
        GLOAM: { maxPerPayment: "100", maxPerDay: "100" },
      },
    },
    "test"
  );
  const [usdg, path, usdce, gloam] = p.assets;
  assert.deepEqual([usdg!.address, usdg!.chainId, usdg!.decimals], [RH_MAINNET_USDG, 4663, 6]);
  assert.deepEqual([path!.address, path!.chainId], [TEMPO_PATHUSD, 4217]);
  assert.deepEqual([usdce!.address, usdce!.chainId], [TEMPO_USDCE, 4217], "USDC.e is mainnet only");
  assert.deepEqual([gloam!.address, gloam!.chainId, gloam!.decimals], [GLOAM_TOKEN, 4663, 18]);
  assert.equal(checkSpend(p, spend({}), [], NOW), null);
  assert.equal(checkSpend(p, spend({ amountWei: parseUnits("6", 6) }), [], NOW)?.code, "over_per_payment");
  // The mainnet entry does not open the testnet asset of the same name.
  assert.equal(checkSpend(p, spend({ network: "robinhood", chainId: GLOAM_NETWORKS.robinhood.chainId, asset: RH_USDG }), [], NOW)?.code, "asset_not_allowed");
  assert.equal(checkSpend(p, spend({ network: "tempo", chainId: GLOAM_NETWORKS.tempo.chainId, asset: TEMPO_PATHUSD }), [], NOW)?.code, "asset_not_allowed");
});

test("Base in limits: a symbol on both sides is the testnet; base-mainnet names the mainnet asset", () => {
  // USDC, EURC and ETH are on both Base networks: alone they are the testnet ones (ETH alone stays Robinhood Chain testnet).
  const plain = resolveAgent("bot", { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: ["USDC", "EURC", "ETH", NATIVE_ASSET] }, "test");
  assert.deepEqual(
    plain.assets.map((a) => [a.address, a.chainId]),
    [
      [BASE_SEPOLIA_USDC, 84532],
      [BASE_SEPOLIA_EURC, 84532],
      [NATIVE_ASSET, GLOAM_NETWORKS.robinhood.chainId],
      [NATIVE_ASSET, GLOAM_NETWORKS.robinhood.chainId],
    ]
  );
  assert.equal(checkSpend(plain, spend({ network: "base-mainnet", chainId: 8453, asset: BASE_USDC }), [], NOW)?.code, "asset_not_allowed");
  assert.equal(checkSpend(plain, spend({ network: "base-mainnet", chainId: 8453, asset: NATIVE_ASSET, amountWei: 1n }), [], NOW)?.code, "asset_not_allowed");
  assert.equal(checkSpend(plain, spend({ network: "base", chainId: 84532, asset: BASE_SEPOLIA_USDC }), [], NOW), null);

  const real = resolveAgent(
    "bot",
    {
      recipients: [PAYEE],
      assets: {
        USDC: { network: "base-mainnet", maxPerPayment: "5", maxPerDay: "10" },
        ETH: { network: "base-mainnet", maxPerPayment: "0.01", maxPerDay: "0.05" },
        USDT: { maxPerPayment: "3", maxPerDay: "6" },
      },
    },
    "test"
  );
  const [usdc, eth, usdt] = real.assets;
  assert.deepEqual([usdc!.address, usdc!.chainId, usdc!.decimals], [BASE_USDC, 8453, 6]);
  assert.deepEqual([eth!.address, eth!.chainId, eth!.decimals], [NATIVE_ASSET, 8453, 18]);
  assert.deepEqual([usdt!.address, usdt!.chainId], [BASE_USDT, 8453], "USDT is Base mainnet only");
  const ethSpend = (wei: bigint) => spend({ network: "base-mainnet", chainId: 8453, asset: NATIVE_ASSET, amountWei: wei });
  assert.equal(checkSpend(real, ethSpend(parseUnits("0.01", 18)), [], NOW), null);
  assert.equal(checkSpend(real, ethSpend(parseUnits("0.02", 18)), [], NOW)?.code, "over_per_payment");
  // The Base mainnet ETH entry does not open ETH on Robinhood Chain testnet or Base Sepolia.
  assert.equal(checkSpend(real, spend({ network: "base", chainId: 84532, asset: NATIVE_ASSET, amountWei: 1n }), [], NOW)?.code, "asset_not_allowed");

  const read2 = (p: string) => readFileSync(p, "utf8");
  const env = { GLOAM_LIMIT_MAX_PER_PAYMENT: "5", GLOAM_LIMIT_MAX_PER_DAY: "10", GLOAM_LIMIT_RECIPIENTS: "any" };
  const inline = loadPolicy({ ...env, GLOAM_LIMIT_ASSETS: "USDC,EURC,USDT", GLOAM_LIMIT_NETWORK: "base-mainnet" }, read2);
  assert.equal(inline.mode, "enforced");
  if (inline.mode === "enforced") assert.deepEqual(inline.policy.assets.map((a) => a.chainId), [8453, 8453, 8453]);
  // There is no USDT on Base Sepolia, so naming it there fails closed.
  assert.equal(loadPolicy({ ...env, GLOAM_LIMIT_ASSETS: "USDT", GLOAM_LIMIT_NETWORK: "base" }, read2).mode, "invalid");
});

test("GLOAM_LIMIT_NETWORK names the network of inline limits", () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-mainnet-"));
  writeFileSync(join(dir, "x"), "");
  const base = { GLOAM_LIMIT_ASSETS: "pathUSD,USDC.e", GLOAM_LIMIT_MAX_PER_PAYMENT: "5", GLOAM_LIMIT_MAX_PER_DAY: "10", GLOAM_LIMIT_RECIPIENTS: "any" };
  const mainnet = loadPolicy({ ...base, GLOAM_LIMIT_NETWORK: "tempo-mainnet" }, read);
  assert.equal(mainnet.mode, "enforced");
  if (mainnet.mode === "enforced") assert.deepEqual(mainnet.policy.assets.map((a) => a.chainId), [4217, 4217]);
  const bad = loadPolicy({ ...base, GLOAM_LIMIT_NETWORK: "mainnet" }, read);
  assert.equal(bad.mode, "invalid");
  // USDC.e does not exist on the testnet, so naming the testnet for it fails closed.
  const wrong = loadPolicy({ ...base, GLOAM_LIMIT_NETWORK: "tempo" }, read);
  assert.equal(wrong.mode, "invalid");
});

test("authorize-access-key takes --network", () => {
  assert.equal(parseFlags(["--network", "tempo-mainnet", "--owner", "0x1"]).network, "tempo-mainnet");
  assert.equal(parseFlags(["--network=tempo"]).network, "tempo");
});
