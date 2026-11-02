/**
 * Self-test: stablecoin swaps on Base and Ethereum.
 *
 *  - the switch: nothing is on until a chain's router address is filled in, and only
 *    the pinned address turns it on
 *  - quotes on the two chains stop at a pool too thin for the size (and name a size that
 *    fits) and at a dollar pair far off a dollar for a dollar; Robinhood Chain and Tempo
 *    keep their rules, a price that moved your way passes, and a refused fresh quote
 *    keeps the one the person agreed to
 *  - every dollar stablecoin is 6 decimals on the chain it lists on, so a dollar pair can
 *    be weighed amount against amount; EURC is not a dollar
 *  - the floor: a swap on Ethereum must cover its gas with its vault fee, in numbers, and
 *    the relay refuses one that doesn't before it sends anything, with the price feed
 *    stale too; a refund never faces it, Base has none, and the status says what it is
 *  - a swap with its deadline about to pass is refused before the dry run
 *  - reverted swaps and refunds have a budget on Ethereum: past it new swaps pause, and
 *    money that is waiting still comes back
 *
 * fetch is stubbed: the relay talks to an in-process fake chain, and the relay key is a
 * throwaway made here. Nothing reaches any host.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx --tsconfig tsconfig.json scripts/selftest-swap-stable.mts
 */
import assert from "node:assert/strict";
import { getAddress, keccak256, parseUnits, toFunctionSelector, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
process.env.GLOAM_RELAYER_PRIVATE_KEY = generatePrivateKey();

const {
  BASE_SWAP_POOLS,
  DOLLARS,
  ETHEREUM_SWAP_POOLS,
  IMPACT_STOP_BPS,
  PEG_STOP_BPS,
  SWAP_DEADLINE_SECONDS,
  SWAP_OFF_PEG,
  SWAP_SEND_MARGIN_SECONDS,
  SWAP_TOO_THIN,
  SwapQuoteRefused,
  VALUE_STOP_BPS,
  VALUE_WARN_BPS,
  VAULT_SWAP_ROUTERS,
  VAULT_SWAP_V3_ADDRESS,
  VAULT_SWAP_V3_LIVE,
  encodeRoute,
  escrowAddress,
  pegGapBps,
  planVaultSwap,
  poolId,
  replanVaultSwap,
  routesBetween,
  swapBufferBps,
  swapChecked,
  swapRouterFor,
  swapV3Live,
  valueGapBps,
  vaultSwapRouter,
} = await import("../src/lib/vaultSwap");
const { FEED_MAX_AGE_SEC, hasSwapFloor, smallestSwapUsd, swapFloorMessage, swapFloorShown, swapGasUnits } = await import("../src/lib/relay/swapFloor");
const { RelayError, SWAPS_PAUSED_MESSAGE, assertSwapWorthSending, countRevertedSwap, relayStatus, relayVaultSwap, resetSwapFloorReads } = await import("../src/lib/relay/server");
const { resetGasReads } = await import("../src/lib/relay/gasCeiling");
const { getNetwork } = await import("../src/lib/networks");
const { knownTokens } = await import("../src/lib/tokens");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const NATIVE = "0x0000000000000000000000000000000000000000" as Address;
const E = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  USDG: "0xe343167631d89B6Ffc58B88d6b7fB0228795491D",
  EURC: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
} as const;
const B = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
} as const;
const usd = (n: number) => parseUnits(String(n), 6);

function on(chainId: number) {
  VAULT_SWAP_V3_LIVE[chainId] = VAULT_SWAP_V3_ADDRESS[chainId]!;
  VAULT_SWAP_ROUTERS[chainId] = VAULT_SWAP_V3_ADDRESS[chainId]!;
}
function off(chainId: number) {
  VAULT_SWAP_V3_LIVE[chainId] = null;
  VAULT_SWAP_ROUTERS[chainId] = null;
}

/** Quotes as the V4Quoter gives them: `rate(amount, route)` out for one in, null where a route can't fill. */
function quotes(rate: (amount: bigint, hops: number) => number | null) {
  const out = (amount: bigint, hops: number) => {
    const r = rate(amount, hops);
    return r === null ? null : BigInt(Math.floor(Number(amount) * r));
  };
  return {
    multicall: async ({ contracts }: { contracts: { functionName: string; args: [{ exactAmount: bigint; path: unknown[] }] }[] }) => {
      if (contracts[0]?.functionName === "allowedPool") return contracts.map(() => true);
      return contracts.map((c) => {
        const o = out(c.args[0].exactAmount, c.args[0].path.length);
        return o === null ? { status: "failure" } : { status: "success", result: [o, 0n] };
      });
    },
    simulateContract: async ({ args }: { args: [{ exactAmount: bigint; path: unknown[] }] }) => {
      const a = args[0].exactAmount;
      const r = rate(a, args[0].path.length) ?? 1;
      return { result: [BigInt(Math.ceil(Number(a) / r))] };
    },
  } as never;
}

// ---------------------------------------------------------------- the switch

await test("nothing is on until a router address is filled in, and only the pinned one turns a chain on", () => {
  assert.deepEqual({ ...VAULT_SWAP_V3_LIVE }, { 4663: null, 8453: null, 1: null, 4217: null });
  assert.equal(vaultSwapRouter(8453), null);
  assert.equal(vaultSwapRouter(1), null);
  VAULT_SWAP_V3_LIVE[1] = "0x000000000000000000000000000000000000dEaD";
  assert.equal(swapV3Live(1), false, "a typo stays off");
  VAULT_SWAP_V3_LIVE[1] = VAULT_SWAP_V3_ADDRESS[1]!.toLowerCase() as Address;
  assert.equal(swapV3Live(1), true, "the pinned address, in any case");
  VAULT_SWAP_V3_LIVE[1] = null;
});

await test("every dollar stablecoin is 6 decimals, and EURC is not a dollar", () => {
  for (const a of DOLLARS) {
    const t = knownTokens().find((x) => x.address.toLowerCase() === a.toLowerCase());
    assert.equal(t?.decimals, 6, a);
  }
  assert.ok(!DOLLARS.some((d) => d.toLowerCase() === B.EURC.toLowerCase() || d.toLowerCase() === E.EURC.toLowerCase()));
  assert.equal(swapBufferBps(1, E.USDC, E.USDT), 10);
  assert.equal(swapBufferBps(1, E.USDT, E.USDG), 10);
  assert.equal(swapBufferBps(1, E.USDC, E.EURC), 50, "a euro pair moves");
  assert.equal(swapBufferBps(8453, B.USDC, B.USDT), 10);
  assert.equal(swapBufferBps(8453, B.USDT, B.EURC), 50);
});

await test("Ethereum's USDT to USDG goes through USDC as well as its thin direct pool", () => {
  on(1);
  const r = swapRouterFor(1)!;
  const routes = routesBetween(E.USDT, E.USDG, r);
  assert.ok(routes.some((x) => x.length === 1 && poolId(x[0]!) === poolId(ETHEREUM_SWAP_POOLS[10]!)), "direct");
  assert.ok(routes.some((x) => x.length === 2 && poolId(x[0]!) === poolId(ETHEREUM_SWAP_POOLS[4]!) && poolId(x[1]!) === poolId(ETHEREUM_SWAP_POOLS[8]!)), "through USDC");
  off(1);
});

// ---------------------------------------------------------------- quotes

const ask = (assetIn: Address, assetOut: Address, amountIn: bigint) => ({ assetIn, assetOut, amountIn, feeBps: 25 });

await test("a healthy dollar pair quotes, with its gap to a dollar", async () => {
  on(8453);
  const p = await planVaultSwap(quotes(() => 0.9991), 8453, ask(B.USDT, B.USDC, usd(1_000)));
  assert.equal(p.pegBps, 9);
  assert.equal(p.impactBps, 0);
  assert.equal(p.amountOut, (p.available * 9991n * 9990n) / 100_000_000n);
  assert.ok(p.cost <= p.available);
  off(8453);
});

await test("a price that pays more than a dollar passes", async () => {
  on(1);
  const p = await planVaultSwap(quotes(() => 1.05), 1, ask(E.USDC, E.USDT, usd(1_000)));
  assert.equal(p.pegBps, 0);
  off(1);
});

await test("a dollar pair past the stop is refused, whatever the size", async () => {
  on(1);
  await assert.rejects(
    planVaultSwap(quotes(() => 0.97), 1, ask(E.USDC, E.USDT, usd(100))),
    (e: unknown) => e instanceof SwapQuoteRefused && e.message === SWAP_OFF_PEG && e.fitsIn === null
  );
  assert.equal(pegGapBps(1_000_000n, 980_000n), PEG_STOP_BPS);
  const edge = await planVaultSwap(quotes(() => 0.9801), 1, ask(E.USDC, E.USDT, usd(100)));
  assert.ok(edge.pegBps! <= PEG_STOP_BPS, "at the stop, not past it");
  off(1);
});

await test("Base's EURC pool at $10,000: refused, and the error names a size that fits", async () => {
  on(8453);
  // the shape of the live pool on 2026-11-02: 1.114 small, 0.98 at $1,000, 0.129 at $10,000
  const rate = (a: bigint) => (a < usd(200) ? 1.114 : a < usd(1_000) ? 1.108 : a < usd(5_000) ? 0.98 : 0.129);
  await assert.rejects(planVaultSwap(quotes(rate), 8453, ask(B.EURC, B.USDC, usd(10_000))), (e: unknown) => {
    assert.ok(e instanceof SwapQuoteRefused, String(e));
    assert.equal(e.message, SWAP_TOO_THIN);
    assert.ok(e.fitsIn !== null && e.fitsIn > usd(150) && e.fitsIn < usd(1_000), `fits ${e.fitsIn}`);
    return true;
  });
  assert.ok(IMPACT_STOP_BPS < 300);
  off(8453);
});

await test("a route that can't fill at all is no quote", async () => {
  on(8453);
  await assert.rejects(planVaultSwap(quotes(() => null), 8453, ask(B.USDC, B.USDT, usd(100))), /No pool can fill/);
  off(8453);
});

await test("only Base and Ethereum are held to the stops", async () => {
  assert.ok(swapChecked(8453) && swapChecked(1));
  assert.ok(!swapChecked(4663) && !swapChecked(4217));
  const USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const GLOAM: Address = "0xDcD885F5c60b3aD49F6D58718696417314e8724d";
  const p = await planVaultSwap(quotes((a) => (a < usd(50) ? 0.5 : 0.3)), 4663, { ...ask(USDG, GLOAM, usd(1_000)), router: "0xfCa1887e77f738ef9C5751974b3f3873d029F2DC" });
  assert.ok(p.impactBps! > IMPACT_STOP_BPS, "a warning there, not a stop");
});

await test("a fresh quote that is refused keeps the one the person agreed to", async () => {
  on(1);
  const agreed = await planVaultSwap(quotes(() => 0.999), 1, ask(E.USDC, E.USDT, usd(1_000)));
  assert.equal(await replanVaultSwap(quotes(() => 0.9), 1, ask(E.USDC, E.USDT, usd(1_000)), agreed), agreed);
  off(1);
});

await test("value against market prices, for pairs with no peg", () => {
  assert.equal(valueGapBps(100, 99), 100);
  assert.equal(valueGapBps(100, 101), 0);
  assert.equal(valueGapBps(0, 99), null);
  assert.ok(VALUE_WARN_BPS < VALUE_STOP_BPS);
  // a healthy euro swap at the 0.50% fee and 0.5% buffer stays under the warning
  assert.ok(valueGapBps(100, 98.9)! < VALUE_WARN_BPS);
});

// ---------------------------------------------------------------- the floor, in numbers

await test("the floor: gas against the vault fee", () => {
  assert.equal(swapGasUnits(1), 1_700_000n);
  assert.ok(swapGasUnits(3) > swapGasUnits(2) && swapGasUnits(2) > swapGasUnits(1));
  const gwei = (g: number) => BigInt(Math.round(g * 1e9));
  const at = (g: number, feeBps = 25, hops = 1) => smallestSwapUsd({ gasPriceWei: gwei(g), ethUsd: 2_290, feeBps, hops });
  assert.ok(Math.abs(at(0.037) - 57.6) < 0.2, `${at(0.037)}`);
  assert.ok(Math.abs(at(0.037, 50) - 28.8) < 0.1, "twice the fee, half the floor");
  assert.ok(Math.abs(at(1) - 1557) < 2);
  assert.ok(at(3) > 4_600 && at(3) < 4_700);
  assert.equal(smallestSwapUsd({ gasPriceWei: gwei(1), ethUsd: 2_290, feeBps: 0, hops: 1 }), Number.POSITIVE_INFINITY);
  assert.ok(Math.abs(swapFloorShown(100) - 110) < 1e-9);
  assert.ok(!swapFloorMessage("Ethereum", 57.6).includes("—"), "no em dash");
  assert.ok(swapFloorMessage("Ethereum", 57.6).includes("$58"));
  assert.ok(hasSwapFloor(1) && !hasSwapFloor(8453) && !hasSwapFloor(4663) && !hasSwapFloor(4217));
});

// ---------------------------------------------------------------- the relay, on a fake chain

const net = getNetwork("ethereum-mainnet");
const base = getNetwork("base-mainnet");
const POOL = net.pool!;
const SEL = {
  spent: toFunctionSelector("spent(bytes32)"),
  isKnownRoot: toFunctionSelector("isKnownRoot(bytes32)"),
  commitmentSeen: toFunctionSelector("commitmentSeen(bytes32)"),
  fee: toFunctionSelector("withdrawFeeBps()"),
  round: toFunctionSelector("latestRoundData()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
};
const word = (v: bigint | number | boolean) => `0x${BigInt(v).toString(16).padStart(64, "0")}`;
const chain = {
  spent: false,
  gasPrice: 37_000_000n, // 0.037 gwei
  ethUsd: 2_290n * 10n ** 8n,
  feedAt: () => Math.floor(Date.now() / 1000) - 300,
  held: 0n,
  receipt: "success" as "success" | "reverted",
};
const sends: string[] = [];
const reads: string[] = [];
const Z32 = `0x${"00".repeat(32)}`;
const BLOCK = {
  number: "0x1", hash: `0x${"12".repeat(32)}`, parentHash: Z32, nonce: "0x0000000000000000", sha3Uncles: Z32, logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: Z32, stateRoot: Z32, receiptsRoot: Z32, miner: `0x${"00".repeat(20)}`, difficulty: "0x0", totalDifficulty: "0x0", extraData: "0x",
  size: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", timestamp: "0x1", baseFeePerGas: "0x1", transactions: [], uncles: [],
};
type RpcReq = { id: number; method: string; params?: { data?: string; input?: string; to?: string }[] };
function answer(r: RpcReq, chainId: number): unknown {
  switch (r.method) {
    case "eth_chainId":
      return toHex(chainId);
    case "eth_blockNumber":
      return "0x1";
    case "eth_getBlockByNumber":
      return BLOCK;
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_maxPriorityFeePerGas":
      return "0x1";
    case "eth_gasPrice":
      return toHex(chain.gasPrice);
    case "eth_getBalance":
      return toHex(10n ** 18n);
    case "eth_estimateGas":
      return "0x19f0a0";
    case "eth_sendRawTransaction": {
      const hash = keccak256(toHex(`send-${sends.length}`));
      sends.push(hash);
      return hash;
    }
    case "eth_getTransactionReceipt":
      return {
        transactionHash: `0x${"ab".repeat(32)}`, transactionIndex: "0x0", blockHash: BLOCK.hash, blockNumber: "0x1", from: `0x${"00".repeat(20)}`, to: POOL,
        cumulativeGasUsed: "0x1", gasUsed: "0x1", effectiveGasPrice: "0x1", contractAddress: null, logs: [], logsBloom: BLOCK.logsBloom,
        status: chain.receipt === "success" ? "0x1" : "0x0", type: "0x2",
      };
    case "eth_call": {
      const data = (r.params?.[0]?.data ?? r.params?.[0]?.input ?? "") as string;
      const sel = data.slice(0, 10);
      reads.push(sel);
      if (sel === SEL.spent) return word(chain.spent);
      if (sel === SEL.isKnownRoot) return word(true);
      if (sel === SEL.commitmentSeen) return word(false);
      if (sel === SEL.fee) return word(25);
      if (sel === SEL.balanceOf) return word(chain.held);
      if (sel === SEL.round) return `0x${[1, chain.ethUsd, chain.feedAt(), chain.feedAt(), 1].map((v) => word(BigInt(v)).slice(2)).join("")}`;
      throw new Error(`fake chain: eth_call ${sel}`);
    }
    default:
      throw new Error(`fake chain: ${r.method}`);
  }
}
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const chainId = url.includes("base") ? 8453 : 1;
  const body = JSON.parse(String(init?.body));
  const one = (r: RpcReq) => {
    try {
      return { jsonrpc: "2.0", id: r.id, result: answer(r, chainId) };
    } catch (e) {
      return { jsonrpc: "2.0", id: r.id, error: { code: -32000, message: (e as Error).message } };
    }
  };
  return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let nul = 1;
const proof = `0x${"11".repeat(256)}`;
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
function swapBody(asset: Address, out: Address, amount: bigint, route: readonly unknown[], over: Record<string, unknown> = {}) {
  nul++;
  return {
    router: VAULT_SWAP_V3_ADDRESS[1],
    spend: { proof, root: `0x${"22".repeat(32)}`, nullifier: `0x${nul.toString(16).padStart(64, "0")}`, asset, amount: amount.toString() },
    deposit: { proof, commitment: `0x${(nul + 1000).toString(16).padStart(64, "0")}`, asset: out, amount: ((amount * 99n) / 100n || 1n).toString() },
    refund: { proof, commitment: `0x${(nul + 2000).toString(16).padStart(64, "0")}`, asset, amount: (amount - amount / 100n).toString() },
    route,
    exitKey: "0x00000000000000000000000000000000000e417e",
    deadline: deadline().toString(),
    ...over,
  };
}
const direct = [ETHEREUM_SWAP_POOLS[4]!];
const isCode = (code: string) => (e: unknown) => e instanceof RelayError && e.code === code;
function fresh() {
  sends.length = 0;
  reads.length = 0;
  chain.spent = false;
  chain.gasPrice = 37_000_000n;
  chain.held = 0n;
  chain.feedAt = () => Math.floor(Date.now() / 1000) - 300;
  chain.receipt = "success";
  resetSwapFloorReads();
  resetGasReads();
}

on(1);
on(8453);

await test("a $100 swap at 0.037 gwei goes out; $20 is refused before anything is sent", async () => {
  fresh();
  const hash = await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct));
  assert.ok(hash.startsWith("0x"));
  assert.equal(sends.length, 1);
  sends.length = 0;
  await assert.rejects(relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(20), direct)), isCode("swap_small"));
  assert.equal(sends.length, 0, "nothing sent");
});

await test("the floor moves with gas: at 1 gwei $100 waits and $2,000 goes", async () => {
  fresh();
  chain.gasPrice = 1_000_000_000n;
  await assert.rejects(relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct)), isCode("swap_small"));
  assert.equal(sends.length, 0);
  await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(2_000), direct));
  assert.equal(sends.length, 1);
});

await test("each hop costs more: a size that clears one hop can miss on three", async () => {
  fresh();
  const hops = (h: number) => smallestSwapUsd({ gasPriceWei: chain.gasPrice, ethUsd: 2_290, feeBps: 25, hops: h });
  const size = usd(Math.ceil(hops(1)) + 1);
  assert.ok(Number(size) / 1e6 < hops(3));
  await assert.doesNotReject(assertSwapWorthSending(net, { asset: E.USDC, amount: size }, 1));
  await assert.rejects(assertSwapWorthSending(net, { asset: E.USDC, amount: size }, 3), isCode("swap_small"));
});

await test("an ETH note is weighed at the feed's price, EURC at face value", async () => {
  fresh();
  await assert.doesNotReject(assertSwapWorthSending(net, { asset: NATIVE, amount: parseUnits("0.05", 18) }, 1));
  await assert.rejects(assertSwapWorthSending(net, { asset: NATIVE, amount: parseUnits("0.01", 18) }, 1), isCode("swap_small"));
  await assert.doesNotReject(assertSwapWorthSending(net, { asset: E.EURC, amount: usd(60) }, 1));
  await assert.rejects(assertSwapWorthSending(net, { asset: E.EURC, amount: usd(50) }, 1), isCode("swap_small"));
});

await test("a stale or broken price feed refuses the swap rather than paying blind", async () => {
  fresh();
  chain.feedAt = () => Math.floor(Date.now() / 1000) - FEED_MAX_AGE_SEC - 60;
  await assert.rejects(assertSwapWorthSending(net, { asset: E.USDC, amount: usd(50_000) }, 1), isCode("check_failed"));
  fresh();
  const was = chain.ethUsd;
  chain.ethUsd = 0n;
  await assert.rejects(assertSwapWorthSending(net, { asset: E.USDC, amount: usd(50_000) }, 1), isCode("check_failed"));
  chain.ethUsd = was;
});

await test("a refund has no floor: money waiting comes back at any size", async () => {
  fresh();
  chain.spent = true;
  chain.held = usd(10);
  const body = swapBody(E.USDC, E.USDT, usd(10), direct);
  await relayVaultSwap(net, body);
  assert.equal(sends.length, 1);
});

await test("a swap with its deadline about to pass is refused before the dry run", async () => {
  fresh();
  const soon = BigInt(Math.floor(Date.now() / 1000) + SWAP_SEND_MARGIN_SECONDS - 5);
  await assert.rejects(relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct, { deadline: soon.toString() })), isCode("SwapExpired"));
  assert.equal(sends.length, 0);
  const late = BigInt(Math.floor(Date.now() / 1000) + SWAP_SEND_MARGIN_SECONDS + 30);
  await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct, { deadline: late.toString() }));
  assert.equal(sends.length, 1);
  // a refund never has a deadline
  fresh();
  chain.spent = true;
  chain.held = usd(100);
  await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct, { deadline: "1" }));
  assert.equal(sends.length, 1, "a refund of a swap long past its deadline");
});

await test("Base has no floor: a $1 swap goes out and the feed is never read", async () => {
  fresh();
  const hash = await relayVaultSwap(base, { ...swapBody(B.USDC, B.USDT, usd(1), [BASE_SWAP_POOLS[2]!]), router: VAULT_SWAP_V3_ADDRESS[8453] });
  assert.ok(hash.startsWith("0x"));
  assert.ok(!reads.includes(SEL.round) && !reads.includes(SEL.fee));
});

await test("the relay's status names the floor on Ethereum and nowhere else", async () => {
  fresh();
  const all = await relayStatus();
  const eth = all.find((n) => n.chainId === 1)!;
  assert.ok(eth.swapFloorUsd != null && Math.abs(eth.swapFloorUsd - 57.6) < 0.5, `${eth.swapFloorUsd}`);
  assert.equal(all.find((n) => n.chainId === 8453)!.swapFloorUsd, null);
  off(1);
  fresh();
  const offNow = await relayStatus();
  assert.equal(offNow.find((n) => n.chainId === 1)!.swapFloorUsd, null, "no router, no floor, no reads");
  assert.ok(!reads.includes(SEL.round));
  on(1);
});

await test("twelve reverted swaps in an hour pause new ones on Ethereum, and only there", async () => {
  fresh();
  for (let i = 0; i < 12; i++) await countRevertedSwap(net);
  await assert.rejects(relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct)), (e: unknown) => isCode("swaps_paused")(e) && (e as Error).message === SWAPS_PAUSED_MESSAGE);
  assert.equal(sends.length, 0);
  for (let i = 0; i < 12; i++) await countRevertedSwap(base);
  await relayVaultSwap(base, { ...swapBody(B.USDC, B.USDT, usd(1), [BASE_SWAP_POOLS[2]!]), router: VAULT_SWAP_V3_ADDRESS[8453] });
  assert.equal(sends.length, 1, "Base has no such budget");
  // money waiting still comes back
  sends.length = 0;
  chain.spent = true;
  chain.held = usd(100);
  await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct));
  assert.equal(sends.length, 1, "a refund goes");
});

await test("a reverted receipt counts against the budget by itself", async () => {
  fresh();
  const { hitRateLimit, readRateLimit } = await import("../src/lib/mcpRemote/rateLimit");
  const reverted = () => readRateLimit("chain:1", "relay-swap-reverted", Date.now(), 3600);
  assert.equal(await readRateLimit("chain:8453", "relay-swap-reverted", Date.now(), 3600), 0, "Base never counts");
  // a swap that lands and reverts, on Base: nothing counted, and its lock is released
  chain.receipt = "reverted";
  const body = { ...swapBody(B.USDC, B.USDT, usd(1), [BASE_SWAP_POOLS[2]!]), router: VAULT_SWAP_V3_ADDRESS[8453] };
  await relayVaultSwap(base, body);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await readRateLimit("chain:8453", "relay-swap-reverted", Date.now(), 3600), 0);
  chain.spent = true;
  chain.held = usd(100);
  const counted = await reverted();
  await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await reverted(), counted + 1, "a swap call that reverted, refund or not");
  await hitRateLimit("selftest", "relay-swap-reverted", 5, Date.now(), 3600);
  assert.equal(await readRateLimit("selftest", "relay-swap-reverted", Date.now(), 3600), 1, "reads what a hit counted");
  assert.equal(await readRateLimit("selftest", "relay-swap-reverted", Date.now(), 3600), 1, "and counts nothing itself");
});

await test("thirty refunds in an hour pause the next one, which stays pending", async () => {
  fresh();
  chain.spent = true;
  chain.held = usd(100);
  let refused = 0;
  for (let i = 0; i < 31; i++) {
    await relayVaultSwap(net, swapBody(E.USDC, E.USDT, usd(100), direct)).catch((e) => {
      assert.ok(isCode("swaps_paused")(e), String(e));
      refused++;
    });
  }
  assert.ok(refused >= 1, "the budget held");
  assert.ok(sends.length <= 30);
});

off(1);
off(8453);

await test("escrow and route bytes stay what they were", () => {
  const key = {
    nullifier: `0x${"33".repeat(32)}` as Hex, amountIn: 1n, outCommitment: `0x${"55".repeat(32)}` as Hex, assetOut: getAddress(E.USDT), amountOut: 1n,
    refundCommitment: `0x${"77".repeat(32)}` as Hex, refundAmount: 1n, routeHash: keccak256(encodeRoute(direct)), exitKey: getAddress("0x00000000000000000000000000000000000e417e"), deadline: 1n,
  };
  assert.notEqual(escrowAddress(VAULT_SWAP_V3_ADDRESS[1]!, E.USDC, key), escrowAddress(VAULT_SWAP_V3_ADDRESS[8453]!, E.USDC, key), "a router's escrow is its own on each chain");
});

console.log(`swap stable: ${passed} passed`);
process.exit(0);
