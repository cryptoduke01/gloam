/**
 * SDK self-test: Base, as it will be once its pools are filled in.
 *
 * Base mainnet (8453) and Base Sepolia (84532) stay hidden until their pool
 * addresses are written into MAINNET_POOLS and BASE_SEPOLIA_POOL (that state is
 * checked in mainnet.selftest.mjs). Here both get placeholder pools before the
 * networks are built, so the rest of the SDK can be checked against them: the
 * mainnet keys on both, payments only, the listed assets and beta limits, ETH
 * listed, no memo board, and Base Sepolia after the older testnets.
 *
 * Run after build:  node test/base.selftest.mjs
 */
import { MAINNET_POOLS, BASE_SEPOLIA_POOL } from "../dist/mainnet.js";

const MAIN_POOL = "0x00000000000000000000000000000000000000b5";
const TEST_POOL = "0x00000000000000000000000000000000000000b6";
// Before constants.js loads: the networks are built from these when it does.
MAINNET_POOLS[8453] = { pool: MAIN_POOL, deployBlock: 100n };
BASE_SEPOLIA_POOL.pool = TEST_POOL;
BASE_SEPOLIA_POOL.deployBlock = 200n;

const {
  mainnetNetwork,
  testnetNetwork,
  gloamNetworks,
  getGloamNetwork,
  networkForChainId,
  poolForChainId,
  baseSepoliaPool,
  networkName,
  circuitArtifactUrls,
  assertDepositAllowed,
  buildShieldBoundIntent,
  buildShieldIntent,
  buildPrivateTradeIntent,
  buildGloamPaymentRequirements,
  buildPaymentRequestLink,
  parsePaymentRequestLink,
  payMemoBoardFor,
  generateReceiveKey,
  GLOAM_NETWORKS,
  NATIVE_ASSET,
  BASE_USDC,
  BASE_USDT,
  BASE_SEPOLIA_USDC,
  BASE_SEPOLIA_EURC,
} = await import("../dist/index.js");

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}
function throws(fn, re, msg) {
  try {
    fn();
  } catch (e) {
    assert(re.test(String(e?.message ?? e)), `${msg}: wrong error "${e?.message}"`);
    return;
  }
  assert(false, `${msg}: did not throw`);
}
async function throwsAsync(fn, re, msg) {
  try {
    await fn();
  } catch (e) {
    assert(re.test(String(e?.message ?? e)), `${msg}: wrong error "${e?.message}"`);
    return;
  }
  assert(false, `${msg}: did not throw`);
}

const prover = async () => ({ proofBytes: "0x" + "ab".repeat(256), publicSignals: [] });
const eth = (s) => BigInt(Math.round(Number(s) * 1e6)) * 10n ** 12n;

// ── the two networks ─────────────────────────────────────────────────────────────
const main = mainnetNetwork("base");
const test = testnetNetwork("base");
assert(main && main.key === "base-mainnet" && main.chainId === 8453 && main.pool === MAIN_POOL && main.deployBlock === 100n, "Base mainnet entry");
assert(test && test.key === "base" && test.chainId === 84532 && test.pool === TEST_POOL && test.deployBlock === 200n, "Base Sepolia entry");
for (const n of [main, test]) {
  assert(n.label === "Base" && n.family === "base", `${n.key}: label and family`);
  assert(n.ceremony === "production", `${n.key}: the ceremony's final keys`);
  assert(n.nativeShield === true && n.payMemo === null, `${n.key}: ETH listed, no memo board yet`);
  assert(n.chain.id === n.chainId && /publicnode\.com$/.test(new URL(n.rpcUrl).host), `${n.key}: viem chain, an RPC that serves eth_getLogs`);
}
assert(main.testnet === false && test.testnet === true, "real money on mainnet, test funds on Sepolia");
assert(main.explorerUrl === "https://basescan.org" && test.explorerUrl === "https://sepolia.basescan.org", "Basescan");
assert(main.assets.map((a) => a.symbol).join() === "USDC,EURC,USDT,ETH", "Base mainnet assets");
assert(test.assets.map((a) => a.symbol).join() === "USDC,EURC,ETH", "Base Sepolia assets, no USDT");
assert(baseSepoliaPool()?.pool === TEST_POOL, "baseSepoliaPool reads BASE_SEPOLIA_POOL");

// ── lookups ──────────────────────────────────────────────────────────────────────
const keys = gloamNetworks().map((n) => n.key);
assert(keys.join() === "robinhood-mainnet,tempo-mainnet,base-mainnet,robinhood,tempo,base", `network order (${keys.join()})`);
assert(getGloamNetwork("base") === test && getGloamNetwork("base-mainnet") === main, "by key");
assert(networkForChainId(84532) === test && networkForChainId(8453) === main, "by chain id");
assert(poolForChainId(84532) === TEST_POOL && poolForChainId(8453) === MAIN_POOL, "pool by chain id");
assert(testnetNetwork("tempo") === GLOAM_NETWORKS.tempo && !("base" in GLOAM_NETWORKS), "GLOAM_NETWORKS keeps its two testnets");
assert(networkName(84532) === "Base testnet" && networkName(8453) === "Base", "names");
assert(circuitArtifactUrls("unshield", 84532).zkey.endsWith("/final/unshield_final.zkey"), "Sepolia proves with the final keys");

// ── deposits: listed assets only, within the beta limits ─────────────────────────
assertDepositAllowed(84532, BASE_SEPOLIA_USDC, 500_000_000n);
throws(() => assertDepositAllowed(84532, BASE_SEPOLIA_EURC, 500_000_001n), /at most 500 EURC per deposit/, "EURC over 500 refused");
throws(() => assertDepositAllowed(84532, BASE_USDC, 1n), /does not list/, "mainnet USDC is not listed on Sepolia");
throws(() => assertDepositAllowed(84532, BASE_USDT, 1n), /does not list/, "no USDT on Sepolia");
throws(() => assertDepositAllowed(84532, "0x00000000000000000000000000000000000000bb", 1n), /does not list/, "unlisted asset refused");
assertDepositAllowed(84532, NATIVE_ASSET, eth("0.2"));
throws(() => assertDepositAllowed(84532, NATIVE_ASSET, eth("0.21")), /at most 0\.2 ETH per deposit/, "ETH over 0.2 refused");
assertDepositAllowed(8453, BASE_USDT, 500_000_000n);
assertDepositAllowed(8453, NATIVE_ASSET, eth("0.2"));
throws(() => assertDepositAllowed(8453, BASE_USDC, 500_000_001n), /at most 500 USDC per deposit/, "mainnet USDC over 500 refused");
throws(() => assertDepositAllowed(8453, BASE_SEPOLIA_USDC, 1n), /does not list/, "test USDC is not listed on mainnet");

// ── builders ─────────────────────────────────────────────────────────────────────
{
  const i = await buildShieldBoundIntent({ chainId: 84532, asset: NATIVE_ASSET, amountWei: eth("0.2"), prover });
  assert(i.exec.poolAddress === TEST_POOL && i.exec.fn === "shieldBound" && i.exec.valueWei === eth("0.2"), "ETH deposit on Sepolia sends value to its pool");
  await throwsAsync(
    () => buildShieldBoundIntent({ chainId: 84532, asset: NATIVE_ASSET, amountWei: eth("0.21"), prover }),
    /beta limit/,
    "builder checks the limit before proving"
  );
  await throwsAsync(() => buildShieldIntent({ chainId: 84532, amountWei: 1n }), /Plain shield\(\) is off/, "no plain shield on Sepolia");
  await throwsAsync(
    () => buildPrivateTradeIntent({ chainId: 84532, secretHex: "0x01", amountInWei: 1n, amountSwapWei: 1n, assetOut: BASE_SEPOLIA_USDC, amountOutMinWei: 1n, rateIn: 1n, rateOut: 1n, path: {}, prove: prover }),
    /payments only/,
    "no private trading on Sepolia"
  );
}

// ── payments, requests, boards ───────────────────────────────────────────────────
{
  const payee = await generateReceiveKey();
  const req = buildGloamPaymentRequirements({ amountWei: 10n, asset: BASE_SEPOLIA_USDC, payTo: payee.tag, resource: "r", network: 84532 });
  assert(req.poolAddress === TEST_POOL, "x402 requirements on Base Sepolia name its pool");
  const link = buildPaymentRequestLink({ payTo: payee.tag, network: "base", asset: "eurc", amount: "12.5" });
  const read = parsePaymentRequestLink(link);
  assert(read.networkKey === "base" && read.asset === BASE_SEPOLIA_EURC && read.amount === "12.5", "request link on Base Sepolia");
  assert(parsePaymentRequestLink(buildPaymentRequestLink({ payTo: payee.tag, network: 8453, asset: "ETH" })).asset === NATIVE_ASSET, "request for ETH on Base mainnet");
  throws(() => buildPaymentRequestLink({ payTo: payee.tag, network: "base", asset: "USDT" }), /does not take "USDT"/, "no USDT request on Sepolia");
  assert(payMemoBoardFor(84532) === null && payMemoBoardFor(8453) === null, "no memo boards on Base yet");
}

// ── BASE_SEPOLIA_POOL is checked like MAINNET_POOLS ──────────────────────────────
BASE_SEPOLIA_POOL.pool = "0x1234";
throws(() => baseSepoliaPool(), /BASE_SEPOLIA_POOL\.pool is not a pool address/, "a bad address throws");
BASE_SEPOLIA_POOL.pool = TEST_POOL;
BASE_SEPOLIA_POOL.deployBlock = 0n;
throws(() => baseSepoliaPool(), /BASE_SEPOLIA_POOL\.deployBlock/, "block 0 throws");

console.log(`base selftest: ${checks} checks passed`);
