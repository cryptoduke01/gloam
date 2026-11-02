/**
 * Self-test: private swaps for partners and on the hosted MCP.
 *
 *  - accounting: a private swap is counted with its input token and amount and no
 *    partner fee, apart from public volume, per day and per network
 *  - the partner relay (lib/partnerRelay): a swap whose note the vault reads as
 *    unspent is counted; one whose note is already spent (the refund path) and an
 *    exit are sent and not counted; the vault is read before the send, and a read
 *    that fails sends nothing; nothing in the request decides what is counted
 *  - the v1 routes: swap and swapExit refused on a network with no swaps, before
 *    any chain read; GET /api/v1/swaps; the quote route's input checks
 *  - the server quote (lib/swapQuote) against a fake chain: a clean quote, and each
 *    stop the swap tab applies (refund_wont_fit, vault_closed, over_room, relay_off,
 *    gas_high, swap_small with the relay's floor, floor_unread), the quote errors in
 *    plain words, and bad input refused before any read
 *  - the hosted MCP's gloam_swap_quote: listed, refused off the swap networks and on
 *    bad arguments before any read, and secret screening still runs first
 *
 * The partner store is the in-process one and every chain read is a fake: nothing
 * reaches any host.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-partner-swaps.mts
 */
import assert from "node:assert/strict";
import type { Address, Hex, PublicClient } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.GLOAM_API_KEY_PEPPER;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "test";

const { resetMemoryKv } = await import("../src/lib/partnersKv");
const { apiKeyPepper, createApiKey } = await import("../src/lib/apiKeys");
const { commissionFor, describeFee, readPartnerStats, recordActivity, upsertPartner, ACTIVITY_KINDS } = await import("../src/lib/partners");
const { relayForPartner, partnerRelayDeps } = await import("../src/lib/partnerRelay");
const { RelayError } = await import("../src/lib/relay/server");
const { getNetwork, NETWORK_KEYS } = await import("../src/lib/networks");
const { SwapQuoteError, quoteSwapServer, SWAP_PUBLIC_LINE } = await import("../src/lib/swapQuote");
const vs = await import("../src/lib/vaultSwap");
const { smallestSwapUsd, swapFloorMessage, swapFloorShown } = await import("../src/lib/relay/swapFloor");
const { POST: relayPost } = await import("../src/app/api/v1/relay/route");
const { GET: swapsGet } = await import("../src/app/api/v1/swaps/route");
const { POST: quotePost } = await import("../src/app/api/v1/swaps/quote/route");
const { callTool, TOOLS } = await import("../src/lib/mcpRemote/tools");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

resetMemoryKv();
const RH = getNetwork("robinhood-mainnet");
const TEMPO = getNetwork("tempo-mainnet");
const RH_TEST = getNetwork("robinhood");
const RH_USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const TEMPO_USDCE = "0x20c000000000000000000000b9537d11c60e8b50" as Address;
const TEMPO_PATHUSD = "0x20c0000000000000000000000000000000000000" as Address;
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const wallet = privateKeyToAccount(generatePrivateKey());
const partner = await upsertPartner(wallet.address, { name: "Swap Desk" });

// ---------------------------------------------------------------- accounting

await test("accounting: a swap has no partner fee, and its input is valued when priced", () => {
  const fees = { privatePaymentCents: 5, cashoutBps: 25, depositBps: 10 };
  assert.ok(ACTIVITY_KINDS.includes("private_swap"));
  const priced = commissionFor("private_swap", fees, { amount: 250_000_000n, decimals: 6, priceMicros: 1_000_000n });
  assert.deepEqual(priced, { feeUsdMicros: 0n, feeToken: 0n, volumeUsdMicros: 250_000_000n });
  const unpriced = commissionFor("private_swap", fees, { amount: 10n ** 18n, decimals: 18, priceMicros: null });
  assert.deepEqual(unpriced, { feeUsdMicros: 0n, feeToken: 0n, volumeUsdMicros: null });
  assert.equal(describeFee("private_swap", fees), "No partner fee on private swaps");
});

await test("accounting: swaps are counted apart from public volume, per day and per network", async () => {
  const p = await upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Counted", fees: { cashoutBps: 25 } });
  const a = await recordActivity({ partner: p, keyId: "key_a", network: RH, kind: "private_swap", txHash: H(101), edge: { asset: RH_USDG, amount: 300_000_000n } });
  assert.ok(a.recorded);
  if (a.recorded) {
    assert.equal(a.record.kind, "private_swap");
    assert.equal(a.record.amount, "300000000");
    assert.equal(a.record.asset?.toLowerCase(), RH_USDG.toLowerCase());
    assert.equal(a.record.feeUsd, 0);
    assert.equal(a.record.volumeUsd, 300);
    assert.equal(a.record.feeBasis, "No partner fee on private swaps");
  }
  await recordActivity({ partner: p, keyId: "key_a", network: RH, kind: "cash_out", txHash: H(102), edge: { asset: RH_USDG, amount: 100_000_000n } });
  const dup = await recordActivity({ partner: p, keyId: "key_a", network: RH, kind: "private_swap", txHash: H(101), edge: { asset: RH_USDG, amount: 1n } });
  assert.equal(dup.recorded, false, "a transaction counts once");
  const stats = await readPartnerStats(p.id, { recent: 5 });
  assert.equal(stats.totals.privateSwaps, 1);
  assert.equal(stats.totals.swapVolumeUsd, 300);
  assert.equal(stats.totals.cashOuts, 1);
  assert.equal(stats.totals.publicVolumeUsd, 100, "public volume stays deposits and cash outs");
  assert.equal(stats.byKind.private_swap.count, 1);
  assert.equal(stats.byKind.private_swap.commissionUsd, 0);
  assert.equal(stats.byNetwork["robinhood-mainnet"].private_swap, 1);
  assert.equal(stats.daily.at(-1)!.swaps, 1);
  assert.equal(stats.daily.at(-1)!.volumeUsd, 100, "daily volume stays deposits and cash outs");
  const usdg = stats.byAsset.find((r) => r.asset.toLowerCase() === RH_USDG.toLowerCase());
  assert.equal(usdg?.volume, "100", "per-asset volume stays what deposits and cash outs moved");
  assert.equal(stats.recent[0]!.kind, "cash_out");
});

// ---------------------------------------------------------------- partner relay

type Call = string;
function fakeDeps(opts: { spent?: boolean; spentRead?: "ok" | "fail" } = {}) {
  const calls: Call[] = [];
  const recorded: { kind: string; edge: unknown }[] = [];
  const deps = {
    ...partnerRelayDeps,
    relayTransfer: async () => {
      calls.push("transfer");
      return H(1);
    },
    relayUnshield: async () => {
      calls.push("unshield");
      return H(2);
    },
    relayMemo: async () => {
      calls.push("memo");
      return H(3);
    },
    relayVaultSwap: async () => {
      calls.push("swap");
      return H(4 + calls.length);
    },
    relayVaultSwapExit: async () => {
      calls.push("swapExit");
      return H(40 + calls.length);
    },
    isSpent: async () => {
      calls.push("isSpent");
      if (opts.spentRead === "fail") throw new Error("rpc down");
      return opts.spent ?? false;
    },
    record: (async (a: Parameters<typeof recordActivity>[0]) => {
      recorded.push({ kind: a.kind, edge: a.edge });
      return recordActivity(a);
    }) as typeof recordActivity,
  };
  return { deps, calls, recorded };
}

const swapBody = (over: Record<string, unknown> = {}) => ({
  chainId: RH.chainId,
  action: "swap",
  spend: { proof: `0x${"22".repeat(256)}`, root: H(7), nullifier: H(8), asset: RH_USDG, amount: "50000000" },
  deposit: { proof: `0x${"22".repeat(256)}`, commitment: H(9), asset: "0x0000000000000000000000000000000000000000", amount: "1000" },
  refund: { proof: `0x${"22".repeat(256)}`, commitment: H(10), asset: RH_USDG, amount: "49000000" },
  route: [],
  ...over,
});

let txn = 200;
await test("partner relay: a swap of an unspent note is counted, with its input, after the vault read", async () => {
  const { deps, calls, recorded } = fakeDeps({ spent: false });
  const body = swapBody({ spend: { ...swapBody().spend, nullifier: H(++txn) } });
  const r = await relayForPartner({ net: RH, body, partner, keyId: "key_1" }, deps);
  assert.deepEqual(calls, ["isSpent", "swap"], "the vault is read before the send");
  assert.equal(r.action, "swap");
  assert.equal(r.attribution.recorded, true);
  assert.equal(r.attribution.kind, "private_swap");
  assert.deepEqual(recorded[0], { kind: "private_swap", edge: { asset: RH_USDG, amount: 50_000_000n } });
});

await test("partner relay: a swap call for a spent note (the refund path) is sent and not counted", async () => {
  const { deps, calls, recorded } = fakeDeps({ spent: true });
  // what the request says about itself is not read
  const body = swapBody({ kind: "private_swap", refund: { ...swapBody().refund }, unshieldTx: H(77), attribution: { recorded: true } });
  const r = await relayForPartner({ net: RH, body, partner, keyId: "key_1" }, deps);
  assert.deepEqual(calls, ["isSpent", "swap"]);
  assert.deepEqual(r.attribution, { recorded: false, kind: null, reason: "not_billable" });
  assert.equal(recorded.length, 0);
});

await test("partner relay: a vault read that fails sends nothing", async () => {
  const { deps, calls } = fakeDeps({ spentRead: "fail" });
  await assert.rejects(relayForPartner({ net: RH, body: swapBody(), partner, keyId: "key_1" }, deps), (e: unknown) => {
    assert.ok(e instanceof RelayError);
    assert.equal(e.code, "check_failed");
    assert.equal(e.status, 503);
    return true;
  });
  assert.deepEqual(calls, ["isSpent"], "no swap was sent");
});

await test("partner relay: a malformed spend or a network with no swaps is refused before any read", async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(relayForPartner({ net: RH, body: swapBody({ spend: { ...swapBody().spend, nullifier: "0x12" } }), partner, keyId: "k" }, deps), /Invalid nullifier/);
  await assert.rejects(relayForPartner({ net: RH, body: swapBody({ spend: { ...swapBody().spend, amount: "0" } }), partner, keyId: "k" }, deps), /Invalid amount/);
  await assert.rejects(relayForPartner({ net: RH_TEST, body: swapBody({ chainId: RH_TEST.chainId }), partner, keyId: "k" }, deps), (e: unknown) => {
    assert.ok(e instanceof RelayError && e.code === "no_swap");
    return true;
  });
  assert.deepEqual(calls, []);
});

await test("partner relay: an exit is sent and not counted; payments and cash outs as before", async () => {
  const { deps, calls, recorded } = fakeDeps();
  const exit = await relayForPartner({ net: RH, body: { chainId: RH.chainId, action: "swapExit" }, partner, keyId: "k" }, deps);
  assert.deepEqual(exit.attribution, { recorded: false, kind: null, reason: "not_billable" });
  const pay = await relayForPartner({ net: RH, body: { chainId: RH.chainId, action: "transfer" }, partner, keyId: "k" }, { ...deps, relayTransfer: async () => H(++txn) });
  assert.equal(pay.attribution.kind, "private_payment");
  const out = await relayForPartner(
    { net: RH, body: { chainId: RH.chainId, action: "unshield", asset: RH_USDG, amount: "5000000" }, partner, keyId: "k" },
    { ...deps, relayUnshield: async () => H(++txn) }
  );
  assert.equal(out.attribution.kind, "cash_out");
  assert.deepEqual(recorded.map((r) => r.kind), ["private_payment", "cash_out"]);
  assert.deepEqual(calls, ["swapExit"]);
  await assert.rejects(relayForPartner({ net: RH, body: { action: "shield" }, partner, keyId: "k" }, deps), (e: unknown) => {
    assert.ok(e instanceof RelayError && e.code === "bad_action" && e.status === 400);
    return true;
  });
});

// ---------------------------------------------------------------- v1 routes

const HOST = "localhost:3121";
const pepper = (() => {
  const p = apiKeyPepper(HOST);
  if (!p.ok) throw new Error("dev pepper should apply on localhost");
  return p.pepper;
})();
const testKey = (await createApiKey({ partnerId: partner.id, name: "Swaps", env: "test", pepper })).secret;
function req(path: string, init: { method?: string; key?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "x-forwarded-host": HOST };
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://${HOST}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
type Envelope = { v: number; ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
const json = async (r: Response) => (await r.json()) as Envelope;

await test("v1 relay: swap and swapExit on a network with no swaps are refused before any read", async () => {
  const swap = await json(await relayPost(req("/api/v1/relay", { method: "POST", key: testKey, body: swapBody({ chainId: RH_TEST.chainId }) })));
  assert.equal(swap.ok, false);
  assert.equal(swap.error!.code, "no_swap");
  const exit = await json(await relayPost(req("/api/v1/relay", { method: "POST", key: testKey, body: { chainId: RH_TEST.chainId, action: "swapExit" } })));
  assert.equal(exit.error!.code, "no_swap");
  const bad = await json(await relayPost(req("/api/v1/relay", { method: "POST", key: testKey, body: { chainId: RH_TEST.chainId, action: "trade" } })));
  assert.equal(bad.error!.code, "bad_action");
  assert.match(bad.error!.message, /swapExit/);
});

await test("v1 swaps: every network, live ones with their router and named assets", async () => {
  const r = await json(await swapsGet(req("/api/v1/swaps", { key: testKey })));
  assert.equal(r.ok, true);
  const nets = r.data!.networks as import("../src/lib/swapQuote").SwapNetworkView[];
  assert.equal(nets.length, NETWORK_KEYS.length);
  const rh = nets.find((n) => n.network === "robinhood-mainnet")!;
  assert.equal(rh.live, true);
  assert.equal(rh.router, vs.vaultSwapRouter(4663));
  assert.ok(rh.assets.some((a) => a.symbol === "USDG" && a.decimals === 6));
  assert.ok(rh.earlierRouters.length >= 1, "an earlier router stays for refunds");
  const tempo = nets.find((n) => n.network === "tempo-mainnet")!;
  assert.equal(tempo.live, true);
  assert.equal(tempo.venue, "tempo");
  for (const n of nets.filter((x) => x.testnet)) assert.equal(n.live, false, `${n.network} has no swaps`);
  for (const id of [8453, 1]) {
    const n = nets.find((x) => x.chainId === id);
    if (n) assert.equal(n.live, vs.swapV3Live(id), `chain ${id} follows its switch`);
  }
  assert.equal(r.data!.public, SWAP_PUBLIC_LINE);
});

await test("v1 swaps/quote: bad input is refused before any read", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ network: "nowhere", assetIn: RH_USDG, assetOut: RH_USDG, amountIn: "1" }, "network"],
    [{ network: "robinhood-mainnet", chainId: 4217, assetIn: RH_USDG, assetOut: RH_USDG, amountIn: "1" }, "network"],
    [{ network: "robinhood", assetIn: RH_USDG, assetOut: RH_USDG, amountIn: "1" }, "no_swap"],
    [{ network: "robinhood-mainnet", assetIn: "usdg", assetOut: RH_USDG, amountIn: "1" }, "bad_request"],
    [{ network: "robinhood-mainnet", assetIn: RH_USDG, assetOut: RH_USDG, amountIn: "1" }, "same_asset"],
    [{ network: "robinhood-mainnet", assetIn: RH_USDG, assetOut: TEMPO_USDCE, amountIn: "1" }, "swap_asset"],
    [{ network: "robinhood-mainnet", assetIn: RH_USDG, assetOut: "0x0000000000000000000000000000000000000000", amountIn: "1.5" }, "bad_request"],
  ];
  for (const [body, code] of cases) {
    const r = await json(await quotePost(req("/api/v1/swaps/quote", { method: "POST", key: testKey, body })));
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.error!.code, code, JSON.stringify(body));
  }
});

// ---------------------------------------------------------------- server quote

type Limits = Record<string, [bigint, bigint, bigint]>; // asset -> perDeposit, total, deposited
const BIG = 10n ** 30n;
function fakeClient(o: {
  limits?: Limits;
  fee?: number | "fail";
  dex?: "ok" | "fail";
  rate?: bigint; // out per 10_000 in
  gasPriceWei?: bigint;
  feed?: { answer: bigint; updatedAt: number } | "fail";
}): PublicClient {
  const limits = o.limits ?? {};
  const rate = o.rate ?? 9_999n;
  const limitOf = (a: string) => limits[a.toLowerCase()] ?? [BIG, BIG, 0n];
  const c = {
    async readContract(p: { functionName: string; args?: readonly unknown[] }) {
      switch (p.functionName) {
        case "withdrawFeeBps":
          if (o.fee === "fail") throw new Error("unread");
          return o.fee ?? 25;
        case "depositLimit": {
          const l = limitOf(String(p.args![0]));
          return [l[0], l[1]];
        }
        case "deposited":
          return limitOf(String(p.args![0]))[2];
        case "quoteSwapExactAmountIn":
          if (o.dex === "fail") throw new Error("HTTP request failed. URL: https://secret-rpc.example/key");
          return ((p.args![2] as bigint) * rate) / 10_000n;
        case "quoteSwapExactAmountOut":
          return ((p.args![2] as bigint) * 10_000n) / rate;
        case "latestRoundData": {
          if (o.feed === "fail" || !o.feed) throw new Error("no feed");
          return [1n, o.feed.answer, 0n, BigInt(o.feed.updatedAt), 1n];
        }
        default:
          throw new Error(`unexpected read ${p.functionName}`);
      }
    },
    async multicall(p: { allowFailure?: boolean; contracts: { functionName: string; args: readonly unknown[] }[] }) {
      const results = p.contracts.map((k) => {
        if (k.functionName === "allowedPool") return true;
        if (k.functionName === "quoteExactInput") {
          const amount = (k.args[0] as { exactAmount: bigint }).exactAmount;
          return [(amount * rate) / 10_000n, 0n] as const;
        }
        throw new Error(`unexpected multicall ${k.functionName}`);
      });
      return p.allowFailure === false ? results : results.map((result) => ({ status: "success", result }));
    },
    async simulateContract(p: { functionName: string; args: readonly unknown[] }) {
      if (p.functionName !== "quoteExactOutput") throw new Error("unexpected simulate");
      const amount = (p.args[0] as { exactAmount: bigint }).exactAmount;
      return { result: [(amount * 10_000n) / rate + 1n, 0n] };
    },
    async getGasPrice() {
      return o.gasPriceWei ?? 1_000_000_000n;
    },
  };
  return c as unknown as PublicClient;
}
const relayOn = async () => ({ enabled: true, gasHigh: false });
const NOW = 1_800_000_000_000;

await test("quote: a clean quote on Tempo, JSON-safe, with no stop", async () => {
  const q = await quoteSwapServer(TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" }, { client: fakeClient({}), relay: relayOn, now: () => NOW });
  assert.equal(q.stop, null);
  assert.equal(q.feeBps, 25);
  assert.equal(q.available, "99750000");
  assert.equal(q.amountOut, ((((99_750_000n * 9_999n) / 10_000n) * 9_990n) / 10_000n).toString());
  assert.equal(q.routerVersion, vs.swapRouterFor(4217)!.version);
  assert.equal(q.valueChecked, false);
  assert.equal(q.public, SWAP_PUBLIC_LINE);
  assert.equal(q.quotedAt, NOW);
  assert.ok(BigInt(q.limits.maxIn!) > 0n);
  JSON.stringify(q); // no bigint anywhere
});

await test("quote: a refund note the vault could not take back stops the swap, with the most one swap can spend", async () => {
  const limits: Limits = { [TEMPO_USDCE.toLowerCase()]: [50_000_000n, BIG, 0n] };
  const q = await quoteSwapServer(TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" }, { client: fakeClient({ limits }), relay: relayOn });
  assert.equal(q.stop?.code, "refund_wont_fit");
  const maxIn = BigInt(q.stop!.maxIn!);
  assert.ok(maxIn > 50_000_000n && maxIn < 51_000_000n, `maxIn ${maxIn}`);
  assert.ok(q.amountOut !== null, "the price still shows");
  const closed = await quoteSwapServer(
    TEMPO,
    { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" },
    { client: fakeClient({ limits: { [TEMPO_USDCE.toLowerCase()]: [0n, 0n, 0n] } }), relay: relayOn }
  );
  assert.equal(closed.stop?.code, "refund_wont_fit");
  assert.equal(closed.stop?.maxIn, "0");
});

await test("quote: an output the vault doesn't take, or has no room for, stops the swap", async () => {
  const closed = await quoteSwapServer(
    TEMPO,
    { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" },
    { client: fakeClient({ limits: { [TEMPO_PATHUSD.toLowerCase()]: [0n, 0n, 0n] } }), relay: relayOn }
  );
  assert.equal(closed.stop?.code, "vault_closed");
  const full = await quoteSwapServer(
    TEMPO,
    { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" },
    { client: fakeClient({ limits: { [TEMPO_PATHUSD.toLowerCase()]: [10_000_000n, BIG, 0n] } }), relay: relayOn }
  );
  assert.equal(full.stop?.code, "over_room");
  const fits = BigInt(full.stop!.fitsIn!);
  assert.ok(fits > 9_000_000n && fits < 10_000_000n, `fitsIn ${fits}`);
  assert.equal(full.limits.outRoom, "10000000");
});

await test("quote: the relay off or over its gas ceiling stops a relayed swap, not one sent from a wallet", async () => {
  const ask = { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" };
  const off = await quoteSwapServer(TEMPO, ask, { client: fakeClient({}), relay: async () => ({ enabled: false, gasHigh: false }) });
  assert.equal(off.stop?.code, "relay_off");
  const high = await quoteSwapServer(TEMPO, ask, { client: fakeClient({}), relay: async () => ({ enabled: true, gasHigh: true }) });
  assert.equal(high.stop?.code, "gas_high");
  const own = await quoteSwapServer(TEMPO, { ...ask, via: "wallet" }, { client: fakeClient({}), relay: async () => ({ enabled: false, gasHigh: true }) });
  assert.equal(own.stop, null);
  assert.equal(own.relay, null);
  const unread = await quoteSwapServer(TEMPO, ask, { client: fakeClient({}), relay: async () => null });
  assert.equal(unread.stop, null, "an unread relay status stops nothing; the relay decides");
});

await test("quote: planning failures come back as stops in plain words, never an RPC's", async () => {
  const ask = { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "100000000" };
  const failed = await quoteSwapServer(TEMPO, ask, { client: fakeClient({ dex: "fail" }), relay: relayOn });
  assert.equal(failed.stop?.code, "quote_failed");
  assert.ok(!failed.stop!.message.includes("secret-rpc"));
  assert.equal(failed.amountOut, null);
  const tiny = await quoteSwapServer(TEMPO, { ...ask, amountIn: "1" }, { client: fakeClient({}), relay: relayOn });
  assert.equal(tiny.stop?.code, "too_small");
  await assert.rejects(quoteSwapServer(TEMPO, ask, { client: fakeClient({ fee: "fail" }), relay: relayOn }), (e: unknown) => {
    assert.ok(e instanceof SwapQuoteError && e.code === "check_failed" && e.status === 503);
    return true;
  });
});

await test("quote: bad input and a network with no swaps are refused before any read", async () => {
  const noReads = {
    readContract: async () => assert.fail("no read"),
    multicall: async () => assert.fail("no read"),
    simulateContract: async () => assert.fail("no read"),
    getGasPrice: async () => assert.fail("no read"),
  } as unknown as PublicClient;
  const bad: [typeof RH, Record<string, unknown>, string][] = [
    [RH_TEST, { assetIn: RH_USDG, assetOut: TEMPO_USDCE, amountIn: "1" }, "no_swap"],
    [TEMPO, { assetIn: "0x12", assetOut: TEMPO_PATHUSD, amountIn: "1" }, "bad_request"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "abc" }, "bad_request"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "0" }, "bad_request"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: (1n << 128n).toString() }, "bad_request"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: -5 }, "bad_request"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_USDCE.toLowerCase(), amountIn: "1" }, "same_asset"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: RH_USDG, amountIn: "1" }, "swap_asset"],
    [TEMPO, { assetIn: TEMPO_USDCE, assetOut: TEMPO_PATHUSD, amountIn: "1", via: "teleport" }, "bad_request"],
  ];
  for (const [net, ask, code] of bad) {
    await assert.rejects(quoteSwapServer(net, ask as never, { client: noReads, relay: relayOn }), (e: unknown) => {
      assert.ok(e instanceof SwapQuoteError, String(e));
      assert.equal(e.code, code, JSON.stringify(ask));
      return true;
    });
  }
});

await test("quote: where gas is dear, a swap under the relay's floor stops, and an unread floor stops too", async () => {
  const ETH = getNetwork(NETWORK_KEYS.includes("ethereum-mainnet") ? "ethereum-mainnet" : "ethereum");
  const wasLive = vs.VAULT_SWAP_V3_LIVE[1];
  const wasRouter = vs.VAULT_SWAP_ROUTERS[1];
  // Ethereum's router as if its switch were on, for this test only.
  vs.VAULT_SWAP_V3_LIVE[1] = vs.VAULT_SWAP_V3_ADDRESS[1]!;
  vs.VAULT_SWAP_ROUTERS[1] = vs.VAULT_SWAP_V3_ADDRESS[1]!;
  try {
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address;
    const feed = { answer: 3_000n * 10n ** 8n, updatedAt: Math.floor(NOW / 1000) - 60 };
    const ask = { assetIn: USDC, assetOut: USDT, amountIn: "100000000" };
    // 1 gwei, ETH at $3,000, a 0.25% fee: the relay's one-hop floor is $2,040, shown 10% above
    const small = await quoteSwapServer(ETH, ask, { client: fakeClient({ feed, gasPriceWei: 1_000_000_000n }), relay: relayOn, now: () => NOW });
    assert.equal(small.stop?.code, "swap_small");
    const floor = swapFloorShown(smallestSwapUsd({ gasPriceWei: 1_000_000_000n, ethUsd: 3_000, feeBps: 25, hops: 1 }));
    assert.ok(Math.abs(floor - 2_244) < 0.01, `floor ${floor}`);
    assert.equal(small.stop!.floorUsd, floor);
    assert.equal(small.stop!.message, swapFloorMessage(ETH.label, floor));
    assert.equal(small.deadlineSeconds, 600);
    const big = await quoteSwapServer(ETH, { ...ask, amountIn: "5000000000" }, { client: fakeClient({ feed, gasPriceWei: 1_000_000_000n }), relay: relayOn, now: () => NOW });
    assert.equal(big.stop, null, JSON.stringify(big.stop));
    assert.ok(big.floorUsd! > 2_000);
    const stale = await quoteSwapServer(ETH, { ...ask, amountIn: "5000000000" }, {
      client: fakeClient({ feed: { ...feed, updatedAt: Math.floor(NOW / 1000) - 3 * 3600 } }),
      relay: relayOn,
      now: () => NOW,
    });
    assert.equal(stale.stop?.code, "floor_unread");
    const own = await quoteSwapServer(ETH, { ...ask, via: "wallet" }, { client: fakeClient({ feed: "fail" }), relay: relayOn, now: () => NOW });
    assert.equal(own.stop, null, "a swap sent from a wallet has no relay floor");
  } finally {
    vs.VAULT_SWAP_V3_LIVE[1] = wasLive ?? null;
    vs.VAULT_SWAP_ROUTERS[1] = wasRouter ?? null;
  }
});

// ---------------------------------------------------------------- hosted MCP

const ctx = { origin: "https://www.gloam.trade", ip: "203.0.113.9" };
async function tool(name: string, args: Record<string, unknown>) {
  const r = await callTool(name, args, ctx);
  return { isError: Boolean(r.isError), text: (r.content[0] as { text: string }).text };
}

await test("hosted MCP: gloam_swap_quote is listed, read only, and named in gloam_info", async () => {
  const t = TOOLS.find((x) => x.name === "gloam_swap_quote");
  assert.ok(t);
  assert.deepEqual((t!.inputSchema as { required?: string[] }).required, ["from", "to", "amount"]);
  assert.equal(t!.annotations?.readOnlyHint, true);
  assert.match(t!.description ?? "", /never builds or sends a swap/);
  assert.match(t!.description ?? "", /tokens and amounts are public/);
  const info = await tool("gloam_info", {});
  assert.match(info.text, /gloam_swap_quote/);
  assert.doesNotMatch(info.text, /this server does not swap/);
  assert.doesNotMatch(info.text.toLowerCase(), /anonymous|untraceable|fully audited/);
});

await test("hosted MCP: off the swap networks and on bad arguments, refused before any read", async () => {
  const off = await tool("gloam_swap_quote", { network: "robinhood", from: "USDG", to: "ETH", amount: "10" });
  assert.equal(off.isError, true);
  assert.match(off.text, /not live on/);
  const unknown = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "DOGE", to: "USDG", amount: "10" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /goes between: .*USDG/);
  const same = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "usdg", to: RH_USDG, amount: "10" });
  assert.match(same.text, /two different assets/);
  const amount = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "USDG", to: "GLOAM", amount: "ten" });
  assert.match(amount.text, /plain number of USDG/);
  const places = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "USDG", to: "GLOAM", amount: "1.0000001" });
  assert.match(places.text, /6 decimal places/);
  const missing = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "USDG" });
  assert.match(missing.text, /from, to and amount/);
});

await test("hosted MCP: secret screening runs before the swap quote", async () => {
  const r = await tool("gloam_swap_quote", { network: "robinhood-mainnet", from: "USDG", to: "ETH", amount: "10", note: `0x${"ab".repeat(32)}` });
  assert.equal(r.isError, true);
  assert.match(r.text, /^Stopped\. What you sent looks like a private key/);
});

console.log(`\n${passed} passed`);
process.exit(0);
