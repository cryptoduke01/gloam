/**
 * Self-test: /admin's Bridge and swaps figures (lib/relayVolume, lib/relayLedger).
 *
 * The fake Relay below follows Relay's documented rule for GET /requests/v3: a
 * referrer filter with no apiKeyId sees public keyless requests only, and every
 * request Gloam tags is a keyed one. So this reproduces the panel's "0 bridges",
 * with a 200 and no error, and shows what fixes it. It also shows both response
 * shapes read the same, a deposit filled under a new request id is counted, once,
 * and no wallet reaches the panel or the store.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-relay-volume.mts
 */
import assert from "node:assert/strict";

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.RELAY_API_KEY_ID;

const { resetMemoryKv, kv } = await import("../src/lib/partnersKv");
const { fetchRelayVolume, readRelayVolume, summarizeRelayRows } = await import("../src/lib/relayVolume");
const { noteRelayQuote, dueRelayQuotes, readRelayRows, OPEN_MS } = await import("../src/lib/relayLedger");

const KEY = "relay-secret-key-value";
const KEY_ID = "11111111-2222-4333-8444-555555555555";
const WALLET = "0xE7a2052a00000000000000000000000000000001";
const RECIPIENT = "0x0708293300000000000000000000000000000002";
const DEPOSIT_ADDRESS = "0xe42445f3a8f05e3311beba77c260b51527b1c141";

const id = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}`;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const cur = (chainId: number, symbol: string, amountFormatted: string, amountUsd: string) => ({
  currency: { chainId, symbol, address: "0x00", decimals: 18 },
  amount: "1",
  amountFormatted,
  amountUsd,
});

/** A real v2 row's shape: same-chain rows carry no data.feesUsd. */
function v2Row(n: number, status = "success") {
  return {
    id: id(n),
    status,
    user: WALLET,
    recipient: RECIPIENT,
    depositAddress: null,
    referrer: "gloam.trade",
    createdAt: ago(1),
    data: {
      inTxs: [{ hash: "0xv2in", chainId: 4663 }],
      outTxs: [{ hash: "0xv2out", chainId: 8453 }],
      expandedPriceImpact: {
        quoted: { swap: { usd: "-9" }, execution: { usd: "-9" }, relay: { usd: "-9" }, app: { usd: "0" }, sponsored: { usd: "0" } },
        actual: { swap: { usd: "-0.7" }, execution: { usd: "-0.1" }, relay: { usd: "-0.2" }, app: { usd: "-5" }, sponsored: { usd: "0" } },
      },
      metadata: {
        sender: WALLET,
        recipient: RECIPIENT,
        currencyIn: cur(4663, "ETH", "0.2145", "501"),
        currencyOut: cur(8453, "USDC", "500.0", "500"),
      },
    },
  };
}

/** The shape in Relay's v3 migration guide: a bridge. */
function v3Bridge(n: number, status = "success") {
  return {
    id: id(n),
    status,
    user: WALLET,
    sender: WALLET,
    recipient: RECIPIENT,
    refundTo: WALLET,
    depositAddress: null,
    requestType: "Bridge",
    createdAt: ago(2),
    data: {
      inTxs: [{ txHash: "0xv3in", chainId: 137 }],
      outTxs: [{ txHash: "0xv3out", chainId: 8453 }],
      fees: {
        quoted: { swap: { usd: "-9" }, execution: { usd: "-9" }, platform: { usd: "-9" }, app: { usd: "0" }, sponsored: { usd: "0" } },
        actual: { swap: { usd: "-1.5" }, execution: { usd: "-0.25" }, platform: { usd: "-0.25" }, app: { usd: "-4" }, sponsored: { usd: "0" } },
      },
      route: {
        quoted: { origin: { inputCurrency: cur(137, "USDC.e", "10000.0", "9999") } },
        actual: {
          origin: { inputCurrency: cur(137, "USDC.e", "10000.0", "9997") },
          destination: { outputCurrency: cur(8453, "USDC", "9995.0", "9995") },
        },
      },
    },
  };
}

/** A same-chain swap on v3 has no destination side. */
function v3Swap(n: number) {
  return {
    id: id(n),
    status: "success",
    user: WALLET,
    recipient: RECIPIENT,
    createdAt: ago(3),
    data: {
      inTxs: [{ txHash: "0xswapin", chainId: 4663 }],
      outTxs: [],
      fees: { actual: { swap: { usd: "0.5" }, execution: { usd: "0" }, platform: { usd: "-0.1" } } },
      route: { actual: { origin: { inputCurrency: cur(4663, "ETH", "0.05", "120"), outputCurrency: cur(4663, "USDG", "118.0", "118") }, destination: null } },
    },
  };
}

type Call = { url: URL; apiKey: string | null };
let calls: Call[] = [];
/** Requests Relay holds for Gloam's key. Gloam only tags keyed quotes, so these are all keyed. */
let keyed: unknown[] = [];
let byDeposit: Record<string, unknown[]> = {};
let byId: Record<string, unknown[]> = {};
let v2Down = false;
let lookupsDown = false;

globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  calls.push({ url, apiKey: headers.get("x-api-key") });
  const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  if (url.pathname === "/requests/v2") {
    if (v2Down) return answer({ message: "Relay retired GET /requests/v2." }, 410);
    return answer({ requests: keyed.filter((r) => "referrer" in (r as object)) });
  }
  if (url.pathname === "/requests/v3") {
    if (!headers.get("x-api-key")) return answer({ message: "headers must have required property 'x-api-key'" }, 400);
    const dep = url.searchParams.get("depositAddress");
    const one = url.searchParams.get("id");
    if (dep || one) {
      if (lookupsDown) return answer({ message: "busy" }, 503);
      return answer({ requests: (dep ? byDeposit[dep] : byId[one!]) ?? [] });
    }
    // The documented rule: a referrer filter with no apiKeyId sees public keyless requests only.
    if (url.searchParams.get("apiKeyId") !== KEY_ID) return answer({ requests: [] });
    return answer({ requests: keyed });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

function reset() {
  resetMemoryKv();
  calls = [];
  keyed = [];
  byDeposit = {};
  byId = {};
  v2Down = false;
  lookupsDown = false;
  delete process.env.RELAY_API_KEY_ID;
}

// ---- Off with no key.
delete process.env.RELAY_API_KEY;
const off = await fetchRelayVolume();
assert.equal(off.enabled, false, "no key, no panel");
assert.equal(calls.length, 0);

// ---- The bug: this is the request the panel made, against Relay's rule.
reset();
keyed = [v3Bridge(1)];
{
  const res = await fetch("https://api.relay.link/requests/v3?referrer=gloam.trade&limit=50", { headers: { "x-api-key": KEY } });
  const json = (await res.json()) as { requests: unknown[] };
  assert.equal(res.status, 200, "no error for the panel to show");
  assert.equal(json.requests.length, 0, "the old read: tagged, keyed requests come back as nothing");
}

// ---- The lasting fix: v3 with the key's id, and the key never in a URL.
reset();
process.env.RELAY_API_KEY_ID = KEY_ID;
keyed = [v3Bridge(1), v3Swap(2)];
{
  const v = await readRelayVolume(KEY);
  const c = calls.find((x) => x.url.pathname === "/requests/v3")!;
  assert.equal(c.url.searchParams.get("referrer"), "gloam.trade");
  assert.equal(c.url.searchParams.get("apiKeyId"), KEY_ID);
  assert.equal(c.apiKey, KEY, "the key goes in the header");
  for (const x of calls) assert.ok(!x.url.toString().includes(KEY), "the key never goes in a URL");

  assert.equal(v.history, "v3");
  assert.equal(v.historyError, null);
  assert.equal(v.all.bridge.count, 1, "the bridge is counted");
  assert.equal(v.all.bridge.inUsd, 9997, "dollars from the route as it ran, not $0");
  assert.equal(v.all.bridge.outUsd, 9995);
  assert.equal(v.all.bridge.feeUsd, 2, "swap, gas and Relay's fee as run; the app fee is not Relay's");
  assert.equal(v.all.swap.count, 1, "same chain is a swap");
  assert.equal(v.all.swap.inUsd, 120);
  assert.equal(v.all.swap.feeUsd, 0, "a swap that beat its quote is no charge, not a negative one");

  const bridge = v.recent.find((r) => r.kind === "bridge")!;
  assert.deepEqual(
    [bridge.fromChainId, bridge.toChainId, bridge.inSymbol, bridge.inAmount, bridge.outSymbol, bridge.outAmount, bridge.tx],
    [137, 8453, "USDC.e", "10000.0", "USDC", "9995.0", "0xv3out"],
    "every field the panel shows is there on v3"
  );
  const swap = v.recent.find((r) => r.kind === "swap")!;
  assert.deepEqual([swap.outSymbol, swap.outAmount, swap.tx], ["USDG", "118.0", "0xswapin"], "a same-chain swap reads its origin side");
}

// ---- No key id yet: v2 still answers, with the same figures, and the page asks for the id.
reset();
keyed = [v2Row(3)];
{
  const v = await readRelayVolume(KEY);
  const c = calls.find((x) => x.url.pathname === "/requests/v2")!;
  assert.equal(c.url.searchParams.get("referrer"), "gloam.trade");
  assert.equal(c.apiKey, KEY);
  assert.equal(v.history, "v2");
  assert.equal(v.all.bridge.count, 1);
  assert.equal(v.all.bridge.inUsd, 501);
  assert.ok(Math.abs(v.all.bridge.feeUsd - 1) < 1e-9, "fees read on a row with no feesUsd; actual over quoted; app fee left out");
  assert.equal(v.recent[0]!.tx, "0xv2out");
}

// ---- A finished row outlives v2: read once, it survives the retirement with no key id.
reset();
keyed = [v2Row(4)];
await readRelayVolume(KEY);
v2Down = true;
{
  const v = await readRelayVolume(KEY);
  assert.equal(v.all.bridge.count, 1, "kept in Gloam's own record");
  assert.match(v.historyError ?? "", /retired/, "and the page says the history read failed");
}

// ---- A deposit filled under a new request id: the quoted id never reports it.
reset();
{
  const quoted = id(10);
  await noteRelayQuote(quoted, DEPOSIT_ADDRESS);
  const filled = { ...v3Bridge(11), depositAddress: { address: DEPOSIT_ADDRESS, type: "open", depositor: WALLET, depositTxHash: "0xdep" } };
  byDeposit[DEPOSIT_ADDRESS] = [filled];
  byId[quoted] = []; // Relay's docs: the quoted id is not returned after a regeneration
  const v = await readRelayVolume(KEY);
  const lookup = calls.find((c) => c.url.searchParams.has("depositAddress"))!;
  assert.equal(lookup.url.searchParams.get("depositAddress"), DEPOSIT_ADDRESS, "looked up by address, not by the quoted id");
  assert.ok(!calls.some((c) => c.url.searchParams.get("id") === quoted));
  assert.equal(v.all.bridge.count, 1, "counted with no tag and no key id");
  assert.equal((await dueRelayQuotes(10)).length, 0, "the quote closes, so the one-time address is gone");

  // The same request also turns up in Relay's history: once only.
  process.env.RELAY_API_KEY_ID = KEY_ID;
  keyed = [filled];
  const again = await readRelayVolume(KEY);
  assert.equal(again.all.bridge.count, 1, "merged by Relay's id, never counted twice");
}

// ---- A private order fills under the quoted id, and is looked up by it.
reset();
{
  await noteRelayQuote(id(12));
  byId[id(12)] = [v3Bridge(12)];
  const v = await readRelayVolume(KEY);
  assert.equal(v.all.bridge.count, 1);
  assert.ok(calls.some((c) => c.url.searchParams.get("id") === id(12)));
}

// ---- A quote nobody pays stays open, moves back in the queue, and goes when its window ends.
reset();
{
  const stale = Date.now() - OPEN_MS - 60_000;
  await noteRelayQuote(id(13), DEPOSIT_ADDRESS, stale);
  await noteRelayQuote(id(14), DEPOSIT_ADDRESS);
  const v = await readRelayVolume(KEY);
  assert.equal(v.all.bridge.count + v.pending, 0, "an unpaid quote is not a bridge");
  const left = await dueRelayQuotes(10);
  assert.deepEqual(left.map((q) => q.requestId), [id(14)], "only the expired one was dropped");

  // Relay not answering is not "nobody paid": an expired quote waits for a real answer.
  await noteRelayQuote(id(15), DEPOSIT_ADDRESS, stale);
  lookupsDown = true;
  await readRelayVolume(KEY);
  assert.equal((await dueRelayQuotes(10)).length, 2, "kept while Relay can't answer");
}

// ---- A flood of quotes is capped, oldest first; each round checks a bounded number.
reset();
{
  const base = Date.now();
  await Promise.all(Array.from({ length: 2_005 }, (_, i) => noteRelayQuote(`0x${i.toString(16).padStart(64, "0")}`, DEPOSIT_ADDRESS, base + i)));
  const [raw] = await kv([["ZRANGE", "gloam:relay:own:open:v1", 0, -1]]);
  assert.equal((raw as string[]).length, 2_000, "the open list has a hard cap");
  assert.ok(!(raw as string[]).some((m) => m.startsWith(`0x${"0".repeat(64)}|`)), "the oldest went first");
  await readRelayVolume(KEY);
  const lookups = calls.filter((c) => c.url.searchParams.has("depositAddress")).length;
  assert.equal(lookups, 20, "a refresh asks Relay about a bounded number");
  const next = await dueRelayQuotes(1);
  assert.ok(next[0]!.at > base + 20, "the ones just asked about go to the back");
}

// ---- A quote nobody paid, and one in flight.
reset();
process.env.RELAY_API_KEY_ID = KEY_ID;
keyed = [v3Bridge(20, "waiting"), v3Bridge(21, "depositing"), v3Bridge(22, "submitted"), v3Bridge(23, "refund"), v3Bridge(24, "failure")];
{
  const v = await readRelayVolume(KEY);
  assert.equal(v.all.bridge.count, 0, "nothing finished");
  assert.equal(v.pending, 2, "v3's new in-flight statuses are in flight; `waiting` is a quote nobody paid");
  assert.equal(v.refunded, 1);
  assert.equal(v.failed, 1);
  assert.ok(calls.some((c) => c.url.searchParams.get("includePendingRequests") === "true"), "v3 leaves these out unless asked");
  const kept = await readRelayRows<{ stage: string }>();
  assert.deepEqual([...kept.values()].map((r) => r.stage).sort(), ["failed", "refunded"], "only finished rows are kept");
}

// ---- Privacy: no wallet reaches the panel or the store, and no request id reaches the page.
reset();
process.env.RELAY_API_KEY_ID = KEY_ID;
keyed = [v3Bridge(30), v3Swap(31)];
await noteRelayQuote(id(32), DEPOSIT_ADDRESS);
byDeposit[DEPOSIT_ADDRESS] = [{ ...v3Bridge(32), depositAddress: { address: DEPOSIT_ADDRESS, type: "open", depositor: WALLET, depositTxHash: "0xdep" } }];
{
  const v = await readRelayVolume(KEY);
  const page = JSON.stringify(v).toLowerCase();
  const kept = JSON.stringify([...(await readRelayRows()).values()]).toLowerCase();
  for (const secret of [WALLET, RECIPIENT, DEPOSIT_ADDRESS]) {
    assert.ok(!page.includes(secret.toLowerCase()), "no wallet on the page");
    assert.ok(!kept.includes(secret.toLowerCase()), "no wallet in the store");
  }
  assert.ok(!page.includes(id(30)), "no request id on the page");
  assert.ok(!page.includes(KEY.toLowerCase()), "no key on the page");
  const [open] = await kv([["ZRANGE", "gloam:relay:own:open:v1", 0, -1]]);
  assert.deepEqual(open, [], "the address left with the closed quote");
}

// ---- The figures themselves.
{
  const now = Date.now();
  const row = (over: Partial<Parameters<typeof summarizeRelayRows>[0][number]>) => ({
    kind: "bridge" as const,
    stage: "done" as const,
    fromChainId: 1,
    toChainId: 4663,
    inSymbol: "ETH",
    inAmount: "1",
    inUsd: 10,
    outSymbol: "USDG",
    outAmount: "9",
    outUsd: 9,
    feeUsd: 1,
    tx: null,
    ts: Math.floor(now / 1000),
    ...over,
  });
  const s = summarizeRelayRows([row({}), row({ ts: Math.floor(now / 1000) - 40 * 86_400 }), row({ stage: "pending", inUsd: 99 })], now);
  assert.equal(s.all.bridge.count, 2);
  assert.equal(s.last30.bridge.count, 1, "the 30-day figure leaves out what's older");
  assert.equal(s.pending, 1);
  assert.equal(s.all.bridge.inUsd, 20, "in-flight money isn't finished volume");
}

console.log("selftest-relay-volume: all checks passed");
process.exit(0);
