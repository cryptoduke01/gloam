/**
 * Self-test: Base Sepolia (84532) and Base mainnet (8453) in the app.
 *
 * Two runs of this file:
 *
 *  - as committed (no Base pool filled in): Base exists nowhere. Not a network
 *    key, not in the API's choices, not offered by the relay or the remote MCP,
 *    and Glim says nothing about it. Its proofs would still use the final keys.
 *  - with placeholder pools put into BASE_SEPOLIA_POOL and MAINNET_POOLS[8453]
 *    before anything else loads (a child process of this one): both networks
 *    show up in the right order with the right chain, keys, assets and limits;
 *    the relay serves both chain ids; the bridge, swaps and the payment-memo
 *    board stay off; claim codes from the other Base network are refused; and
 *    Glim and the remote MCP name Base without ever counting it in the 21
 *    October launch.
 *
 * The placeholder pools are not contracts; nothing reaches any host (fetch
 * fails the run if anything tries).
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-base.mts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
globalThis.fetch = (async (url: unknown) => {
  throw new Error(`selftest-base: no network calls allowed (${String(url)})`);
}) as typeof fetch;

const CONFIGURED = process.env.GLOAM_SELFTEST_BASE === "configured";
const SEPOLIA_POOL = "0x00000000000000000000000000000000000BA5E1";
const MAINNET_POOL = "0x00000000000000000000000000000000000BA5E2";

const mainnet = await import("../src/lib/mainnet");
if (CONFIGURED) {
  // Filled in the way DEPLOY-BASE.md says, before networks.ts reads them.
  mainnet.BASE_SEPOLIA_POOL.pool = SEPOLIA_POOL;
  mainnet.BASE_SEPOLIA_POOL.deployBlock = 1_000_000;
  mainnet.MAINNET_POOLS[8453] = { pool: MAINNET_POOL, deployBlock: 2_000_000n };
}

const nets = await import("../src/lib/networks");
const tokens = await import("../src/lib/tokens");
const { bridgeVisible, BRIDGE_DESTINATIONS } = await import("../src/lib/bridge");
const { vaultSwapRouter } = await import("../src/lib/vaultSwap");
const { faucetFor } = await import("../src/lib/faucet");
const { requestAssetsFor, claimNetworkProblem } = await import("../src/lib/paymentRequest");
const { walkTuning } = await import("../src/lib/leafIndex");
const { gasFor, TRANSFER_GAS_LIMIT } = await import("../src/lib/shield");
const { relayNetworks, networkForChain } = await import("../src/lib/relay/server");
const { knowledgeBlock } = await import("../src/lib/telegramBot/knowledge");
const { chainFix } = await import("../src/lib/telegramBot/rules");
const { callTool } = await import("../src/lib/mcpRemote/tools");

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks++;
  void name;
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  void name;
}

const ctx = { origin: "https://www.gloam.trade", ip: "127.0.0.1" };
async function toolJson(name: string, args: Record<string, unknown> = {}) {
  const r = await callTool(name, args, ctx);
  const first = r.content[0] as { type: string; text: string };
  return { isError: Boolean(r.isError), text: first.text };
}

// ---------------------------------------------------------------- both runs

check("Base entries are always defined, on the mainnet pool and final keys", () => {
  for (const key of ["base", "base-mainnet"] as const) {
    const n = nets.getNetwork(key);
    assert.equal(n.family, "base");
    assert.equal(n.label, "Base");
    assert.equal(n.paymentsPool, true);
    assert.equal(n.ceremony, "production");
    assert.equal(n.stocks, false);
    assert.equal(n.primaryAsset.symbol, "ETH");
    assert.equal(n.logRange, 50_000n);
    assert.equal(n.payMemo, null);
    assert.match(n.chain.rpcUrls.default.http[0]!, /publicnode\.com$/);
  }
  assert.equal(nets.getNetwork("base").chainId, 84532);
  assert.equal(nets.getNetwork("base").testnet, true);
  assert.equal(nets.getNetwork("base").chain.testnet, true);
  assert.equal(nets.getNetwork("base-mainnet").chainId, 8453);
  assert.equal(nets.getNetwork("base-mainnet").testnet, false);
  assert.equal(nets.getNetwork("base").explorerTx("0xab"), "https://sepolia.basescan.org/tx/0xab");
  assert.equal(nets.getNetwork("base-mainnet").explorerAddress("0xcd"), "https://basescan.org/address/0xcd");
  // Proofs for Base are never checked against the dev keys, pool or not.
  assert.equal(nets.ceremonyForChain(84532), "production");
  assert.equal(nets.ceremonyForChain(8453), "production");
  // The older testnets keep theirs.
  assert.equal(nets.ceremonyForChain(42431), "dev");
  assert.equal(nets.getNetwork("tempo").paymentsPool, false);
  assert.equal(nets.getNetwork("tempo-mainnet").paymentsPool, true);
});

check("Base assets as checked on chain, with EURC never counted as a dollar", () => {
  const sepolia = tokens.shieldTokensFor(84532);
  assert.deepEqual(
    sepolia.map((t) => [t.symbol, t.address, t.decimals]),
    [
      ["USDC", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", 6],
      ["EURC", "0x808456652fdb597867f38412077A9182bf77359F", 6],
    ]
  );
  const main = tokens.shieldTokensFor(8453);
  assert.deepEqual(
    main.map((t) => [t.symbol, t.address, t.decimals]),
    [
      ["USDC", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6],
      ["EURC", "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", 6],
      ["USDT", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6],
    ]
  );
  assert.equal(tokens.supportsNativeShield(84532), true);
  assert.equal(tokens.supportsNativeShield(8453), true);
  assert.equal(tokens.supportsNativeShield(4217), false);
  for (const t of [...sepolia, ...main]) {
    assert.equal(tokens.isDollarStable(t), t.symbol !== "EURC", t.symbol);
  }
  // Naming a Base asset by address, on its own chain first.
  assert.equal(tokens.knownTokens(8453)[0]!.symbol, "USDC");
});

check("No bridge, no swaps and no payment-memo board on Base yet", () => {
  assert.equal(BRIDGE_DESTINATIONS.base, undefined);
  assert.equal(bridgeVisible(nets.getNetwork("base-mainnet")), false);
  assert.equal(bridgeVisible(nets.getNetwork("base")), false);
  assert.equal(vaultSwapRouter(8453), null);
  assert.equal(vaultSwapRouter(84532), null);
});

check("Base reads: 50,000-block spans, and the wallet estimates gas", () => {
  assert.equal(walkTuning(84532, 50_000n).span, 50_000n);
  assert.equal(walkTuning(8453, 50_000n).parallel, 3);
  assert.equal(gasFor(8453, TRANSFER_GAS_LIMIT), undefined);
  assert.equal(gasFor(84532, TRANSFER_GAS_LIMIT), undefined);
  assert.equal(gasFor(4663, TRANSFER_GAS_LIMIT), TRANSFER_GAS_LIMIT);
  assert.equal(gasFor(46630, TRANSFER_GAS_LIMIT), TRANSFER_GAS_LIMIT);
});

check("Base Sepolia's faucet step points at its guide", () => {
  const f = faucetFor("base");
  assert.ok(f);
  assert.equal(f.url, "/docs/testnet#base");
  assert.match(f.assets, /USDC/);
  assert.equal(faucetFor("base-mainnet"), null);
});

// ---------------------------------------------------------------- before the pools are in

if (!CONFIGURED) {
  check("unconfigured: Base is no network key anywhere", () => {
    assert.equal(nets.isNetworkKey("base"), false);
    assert.equal(nets.isNetworkKey("base-mainnet"), false);
    assert.ok(!nets.NETWORK_KEYS.some((k) => nets.getNetwork(k).family === "base"));
    assert.ok(!nets.allNetworks().some((n) => n.family === "base"));
    assert.doesNotMatch(nets.networkKeyChoices(), /base/);
    assert.equal(nets.getNetwork("base").pool, null);
    assert.equal(nets.isNetworkWritable(nets.getNetwork("base")), false);
    assert.equal(mainnet.baseSepoliaPool(), null);
    assert.equal(mainnet.mainnetPool(8453), null);
    assert.equal(mainnet.liveMainnetNames(), "Robinhood Chain and Tempo");
  });

  check("unconfigured: the relay refuses both Base chain ids", () => {
    assert.ok(!relayNetworks().some((n) => n.family === "base"));
    assert.throws(() => networkForChain(84532), /not supported by the relay/);
    assert.throws(() => networkForChain(8453), /not supported by the relay/);
  });

  check("unconfigured: Glim says nothing about Base", () => {
    for (const live of [false, true]) {
      const k = knowledgeBlock(false, live);
      assert.doesNotMatch(k, /Base Sepolia|chain ID 8453|chain ID 84532|\nBASE/);
    }
  });

  await checkAsync("unconfigured: the remote MCP neither lists nor takes Base", async () => {
    const all = await toolJson("gloam_networks");
    assert.doesNotMatch(all.text, /"base/);
    const one = await toolJson("gloam_networks", { network: "base" });
    assert.equal(one.isError, true);
    assert.doesNotMatch(one.text, /"base/);
  });

  // The same file again, with the Base pools filled in.
  const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
    env: { ...process.env, GLOAM_SELFTEST_BASE: "configured" },
    encoding: "utf8",
  });
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  assert.equal(child.status, 0, "the configured run failed");
  console.log(`selftest-base (unconfigured): ${checks} checks passed`);
}

// ---------------------------------------------------------------- with the pools filled in

if (CONFIGURED) {
  check("configured: both Base networks are in, in order", () => {
    const keys = nets.NETWORK_KEYS;
    assert.ok(keys.indexOf("base-mainnet") > keys.indexOf("tempo-mainnet"));
    assert.ok(keys.indexOf("base-mainnet") < keys.indexOf("robinhood"));
    assert.equal(keys[keys.length - 1], "base");
    assert.equal(nets.isNetworkKey("base"), true);
    assert.equal(nets.isNetworkKey("base-mainnet"), true);
    assert.match(nets.networkKeyChoices(), /"base"/);
    assert.match(nets.networkKeyChoices(), /"base-mainnet"/);
    const sepolia = nets.getNetwork("base");
    assert.equal(sepolia.pool, SEPOLIA_POOL);
    assert.equal(sepolia.deployBlock, 1_000_000n);
    assert.equal(nets.isNetworkWritable(sepolia), true);
    assert.equal(nets.getNetwork("base-mainnet").deployBlock, 2_000_000n);
    assert.equal(nets.networkName(sepolia), "Base testnet");
    assert.equal(nets.networkName(nets.getNetwork("base-mainnet")), "Base");
    assert.equal(mainnet.liveMainnetNames(), "Robinhood Chain, Tempo and Base");
  });

  check("configured: the relay serves both Base chain ids with the same relay key", () => {
    const ids = relayNetworks().map((n) => n.chainId);
    assert.ok(ids.includes(84532) && ids.includes(8453));
    assert.equal(networkForChain(84532).key, "base");
    assert.equal(networkForChain("8453").key, "base-mainnet");
  });

  check("configured: payment requests and claim codes on Base", () => {
    const assets = requestAssetsFor("base");
    assert.deepEqual(
      assets.map((a) => a.symbol),
      ["USDC", "EURC", "ETH"]
    );
    assert.ok(assets.find((a) => a.symbol === "ETH")!.native);
    // A Base mainnet USDC code opened on Base Sepolia (same vault address) is refused.
    const problem = claimNetworkProblem(
      { key: "base", pool: SEPOLIA_POOL },
      { pool: SEPOLIA_POOL, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
    );
    assert.match(problem ?? "", /different network/);
    assert.equal(
      claimNetworkProblem({ key: "base", pool: SEPOLIA_POOL }, { pool: SEPOLIA_POOL, asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" }),
      null
    );
  });

  check("configured: Glim knows Base, never as part of the 21 October launch", () => {
    const k = knowledgeBlock(false, true);
    assert.match(k, /Base mainnet \(chain ID 8453\)/);
    assert.match(k, /Base Sepolia \(chain ID 84532\)/);
    assert.match(k, /https:\/\/sepolia\.basescan\.org/);
    assert.match(k, /went live on mainnet on Wednesday 21 October 2026 at 13:00 UTC, on Robinhood Chain and Tempo\. Base mainnet joined after that/);
    assert.doesNotMatch(k, /21 October[^.\n]*Tempo and Base/);
    const baseSection = k.slice(k.indexOf("\nBASE"), k.indexOf("\n\n", k.indexOf("\nBASE") + 1));
    assert.ok(baseSection.length > 100);
    assert.doesNotMatch(baseSection, /\u2014/);
    const fix = chainFix("Ada", { wallet: 8453, want: 84532 }, true);
    assert.match(fix, /Switch to Base/);
    assert.match(fix, /chain ID 84532/);
  });

  await checkAsync("configured: the remote MCP lists Base and gives Base Sepolia final-key snippets", async () => {
    const one = await toolJson("gloam_networks", { network: "base" });
    assert.equal(one.isError, false);
    assert.match(one.text, /"chainId": 84532/);
    assert.match(one.text, /"symbol": "EURC"/);
    const mpp = await toolJson("gloam_mpp_how_to", { network: "base" });
    assert.equal(mpp.isError, false);
    assert.match(mpp.text, /testnetNetwork\(\\"base\\"\)/);
    assert.match(mpp.text, /BASE_SEPOLIA_USDC/);
    assert.match(mpp.text, /@gloamtrade\/sdk@\^0\.3\.0/);
    const main = await toolJson("gloam_mpp_how_to", { network: "base-mainnet" });
    assert.match(main.text, /mainnetNetwork\(\\"base\\"\)/);
    assert.match(main.text, /BASE_USDC/);
    const info = await toolJson("gloam_info");
    assert.match(info.text, /Base \(8453\)/);
    assert.match(info.text, /Base Sepolia \(84532\)/);
  });

  console.log(`selftest-base (configured): ${checks} checks passed`);
}
