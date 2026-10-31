/**
 * Self-test: prepaid agent top-ups (lib/agentTopUp, on lib/relay/scheduled).
 *
 * The relay: a dated job's send time (inside its UTC day, up to about 90 days
 * ahead), the existing windows unchanged, a record that can't expire before
 * its job runs (the Redis store, proof swaps included, against a fake
 * Upstash), a passing problem getting a day and never crowding out what is
 * due, and cancelling or renewing a job months ahead. The route: who can read
 * or cancel a job, and a batch of 12 inside the rate limits with them still
 * holding.
 *
 * The browser: a series end to end, from lib/agentTopUp through the real
 * schedule-and-mark path and the real route, against the note vault and a fake
 * node, with a split that saves its notes like lib/cashOutSplit does. Then
 * every way it can stop midway (a refused split, one that may have gone out, a
 * failed proof, a relay that is down, a rate limit, a closed tab) with nothing
 * lost, nothing counted twice, and each top-up accounted for; finishing a
 * stopped series; cancelling; and a job the relay no longer holds after months
 * away.
 *
 * Relay keys are throwaways made here; fetch is stubbed.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-agent-topups.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { toFunctionSelector, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
process.env.GLOAM_RELAYER_PRIVATE_KEY = generatePrivateKey();

const {
  DATED_GIVE_UP_AFTER_MS,
  DATED_RETRY_MS,
  DAY_MS,
  DELAY_WINDOWS,
  GAS_WAIT_MAX_MS,
  GIVE_UP_AFTER_MS,
  JOB_DONE_TTL_SEC,
  JOB_TTL_SEC,
  MAX_DATED_DAYS,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  cancelJob,
  dayOf,
  drawSendAfter,
  drawSendOn,
  jobView,
  liveTtlSec,
  memoryJobStore,
  nextSendDay,
  replaceJobProof,
  runDueJobs,
  sendDayProblem,
} = await import("../src/lib/relay/scheduled");
const { scheduledStore } = await import("../src/lib/relay/scheduledStore");
const {
  TOP_UPS_MAX,
  TOP_UP_EVERY,
  agentGasLine,
  cancelTopUp,
  finishTopUps,
  largestTopUpNote,
  mostTopUps,
  pickTopUpNote,
  reconcileTopUps,
  setUpTopUps,
  topUpAmountProblem,
  topUpDays,
  topUpRows,
  topUpSeries,
  topUpSetAside,
  topUpState,
  topUpTotals,
  topUpWhen,
} = await import("../src/lib/agentTopUp");
const { schedulePiece, unscheduledPieces, keepPiece, cancelledPiece } = await import("../src/lib/cashOutPrivately");
const { dismissReturnedCashOut, returnedCashOutNotes, scheduleNoteCashOut } = await import("../src/lib/cashOutLater");
const { SPLIT_MAYBE_SENT, splitNotes } = await import("../src/lib/cashOutSplit");
const { RELAY_SPEND_LOCK_MS, activeSpendableNotes, saveLocalNote, updateLocalNote, cashOutPending, endedPlan } = await import("../src/lib/shield");
const { getAllNotes } = await import("../src/lib/noteVault");
const { getActiveNetwork, getNetwork } = await import("../src/lib/networks");
const { reconcileClaims } = await import("../src/lib/claimSweep");
const route = await import("../src/app/api/relay/scheduled/route");
type CashOutJob = import("../src/lib/relay/scheduled").CashOutJob;
type ChainView = import("../src/lib/relay/scheduled").ChainView;
type LocalNote = import("../src/lib/shield").LocalNote;
type SplitArgs = import("../src/lib/cashOutSplit").SplitArgs;
type CashOutEnv = import("../src/lib/cashOutLater").CashOutEnv;
type ClaimEnv = import("../src/lib/claimSweep").ClaimEnv;
type PoseidonMerklePath = import("../src/lib/merklePoseidon").PoseidonMerklePath;

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const T0 = 1_800_000_000_000;
const U = 1_000_000n;
const ASSET = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address;
const AGENT = "0x1111111111111111111111111111111111111111" as Address;
const ME = "0x3333333333333333333333333333333333333333" as Address;
const PROOF = ("0x" + "22".repeat(256)) as Hex;
const hex32 = (n: number | bigint) => `0x${BigInt(n).toString(16).padStart(64, "0")}` as Hex;
const sum = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);

// ---------------------------------------------------------------- send time

await test("a dated job goes out at a random time inside its UTC day, not at a fixed time", () => {
  const day = dayOf(T0) + 7 * DAY_MS;
  assert.equal(drawSendOn(T0, day, () => 0), day);
  assert.equal(drawSendOn(T0, day, () => 0.999999999) >= day + DAY_MS - 1_000, true);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const t = drawSendOn(T0, day);
    assert.ok(t >= day && t < day + DAY_MS);
    seen.add(Math.floor((t - day) / (60 * 60 * 1000)));
  }
  assert.equal(seen.size, 24, "every hour of the day gets drawn");
});

await test("today's day never draws sooner than the usual minimum, and never past its end", () => {
  const today = dayOf(T0);
  const now = today + DAY_MS - 10 * 60 * 1000;
  assert.equal(drawSendOn(now, today, () => 0), now + MIN_DELAY_MS);
  for (let i = 0; i < 500; i++) {
    const t = drawSendOn(now, today);
    assert.ok(t >= now + MIN_DELAY_MS && t < today + DAY_MS);
  }
});

await test("a send day must be a whole UTC day, not passed, and about 90 days out at most", () => {
  const today = dayOf(T0);
  for (const bad of [undefined, null, "x", 1.5, -DAY_MS, 0, today + 1, NaN, Infinity]) {
    assert.ok(sendDayProblem(bad, T0), String(bad));
  }
  assert.match(sendDayProblem(today - DAY_MS, T0)!, /passed/);
  assert.match(sendDayProblem(today, today + DAY_MS - MIN_DELAY_MS)!, /passed/, "no room left in it");
  assert.equal(sendDayProblem(today, T0), null);
  assert.equal(sendDayProblem(today + MAX_DATED_DAYS * DAY_MS, T0), null);
  assert.match(sendDayProblem(today + (MAX_DATED_DAYS + 1) * DAY_MS, T0)!, /within 90 days/);
  assert.equal(MAX_DATED_DAYS, 90);
});

await test("a piece scheduled late keeps its day, or takes tomorrow once that has passed", () => {
  const today = dayOf(T0);
  assert.equal(nextSendDay(today + 7 * DAY_MS, T0), today + 7 * DAY_MS);
  assert.equal(nextSendDay(today, T0), today);
  assert.equal(nextSendDay(today - 3 * DAY_MS, T0), today + DAY_MS);
  assert.equal(sendDayProblem(nextSendDay(today - 3 * DAY_MS, T0), T0), null);
});

await test("the windows are exactly what they were", () => {
  assert.deepEqual(Object.keys(DELAY_WINDOWS), ["hour", "6h", "day"]);
  assert.equal(DELAY_WINDOWS.hour, 60 * 60 * 1000);
  assert.equal(DELAY_WINDOWS["6h"], 6 * 60 * 60 * 1000);
  assert.equal(DELAY_WINDOWS.day, 24 * 60 * 60 * 1000);
  assert.equal(MAX_DELAY_MS, 24 * 60 * 60 * 1000);
  assert.equal(GIVE_UP_AFTER_MS, 2 * 60 * 60 * 1000);
  for (const w of ["hour", "6h", "day"] as const) {
    assert.equal(drawSendAfter(T0, w, () => 0), T0 + MIN_DELAY_MS);
    assert.ok(drawSendAfter(T0, w, () => 0.999999999) < T0 + DELAY_WINDOWS[w]);
  }
});

// ---------------------------------------------------------------- the record's lifetime

let seq = 0;
function job(over: Partial<CashOutJob> = {}): CashOutJob {
  seq++;
  return {
    id: `00000000-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`,
    chainId: 4663,
    proof: "0xabcdef",
    root: hex32(1000 + seq),
    nullifier: hex32(seq),
    asset: ASSET,
    to: AGENT,
    amount: "5000000",
    createdAt: T0 - 60_000,
    sendAfter: T0 - 1,
    status: "scheduled",
    attempts: 0,
    updatedAt: T0 - 60_000,
    ...over,
  };
}

await test("a live record outlasts the job whatever its date, gas wait and give-up included", () => {
  for (const lead of [0, MIN_DELAY_MS, MAX_DELAY_MS, 7 * DAY_MS, MAX_DATED_DAYS * DAY_MS]) {
    const ttl = liveTtlSec({ sendAfter: T0 + lead }, T0);
    assert.ok(ttl * 1000 > lead + DATED_GIVE_UP_AFTER_MS, `give-up, ${lead}`);
    assert.ok(ttl * 1000 >= lead + GAS_WAIT_MAX_MS, `gas, ${lead}`);
    assert.equal(ttl, Math.ceil(ttl), "a whole number of seconds");
  }
  assert.equal(liveTtlSec({ sendAfter: T0 - DAY_MS }, T0), JOB_TTL_SEC, "overdue: never less than the floor");
});

/** Just enough of Upstash: strings with their TTLs, the queue, and the two scripts. */
function fakeRedis() {
  const kv = new Map<string, string>();
  const ttls = new Map<string, number>();
  const zset = new Map<string, number>();
  const exec = (a: (string | number)[]): unknown => {
    switch (a[0]) {
      case "SET": {
        const [, k, v] = a;
        if (a.includes("NX") && kv.has(String(k))) return null;
        kv.set(String(k), String(v));
        const ex = a.indexOf("EX");
        if (ex > 0) ttls.set(String(k), Number(a[ex + 1]));
        return "OK";
      }
      case "GET":
        return kv.get(String(a[1])) ?? null;
      case "ZADD":
        zset.set(String(a[3]), Number(a[2]));
        return 1;
      case "ZREM":
        return zset.delete(String(a[2])) ? 1 : 0;
      case "EVAL": {
        if (a[2] === 1) return kv.delete(String(a[3])) ? 1 : 0; // the lock's release
        const [nf, rec, , id, json, ttl, score] = a.slice(3);
        const cur = kv.get(String(nf));
        if (cur && cur !== id) return cur;
        kv.set(String(rec), String(json));
        ttls.set(String(rec), Number(ttl));
        zset.set(String(id), Number(score));
        kv.set(String(nf), String(id));
        ttls.set(String(nf), Number(ttl));
        return id;
      }
      default:
        throw new Error(`fake redis: ${a[0]}`);
    }
  };
  return { kv, ttls, zset, exec };
}

/** Runs `fn` with the Redis store on, over the fake. */
async function withRedis<T>(fn: (r: ReturnType<typeof fakeRedis>) => Promise<T>): Promise<T> {
  const r = fakeRedis();
  const real = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.selftest.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "selftest";
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) =>
    new Response(JSON.stringify({ result: r.exec(JSON.parse(String(init?.body))) }), { status: 200 })) as typeof fetch;
  try {
    return await fn(r);
  } finally {
    globalThis.fetch = real;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

await test("in Redis a job 90 days out keeps its record and its spend's pointer for all of it", async () => {
  await withRedis(async (r) => {
    const lead = MAX_DATED_DAYS * DAY_MS;
    const j = job({ sendAfter: Date.now() + lead, dated: true });
    await scheduledStore().create(j);
    const rec = `gloam:cashout:job:${j.id}`;
    const nf = `gloam:cashout:nf:${j.chainId}:${j.nullifier}`;
    assert.ok(r.ttls.get(rec)! * 1000 >= lead + GAS_WAIT_MAX_MS - 2_000, "record");
    assert.ok(r.ttls.get(nf)! * 1000 >= lead + GAS_WAIT_MAX_MS - 2_000, "pointer");
    assert.equal(r.zset.get(j.id), j.sendAfter, "in the queue for its own time");
  });
});

await test("in Redis a proof swapped in months ahead does not cut the record back to 3 days", async () => {
  await withRedis(async (r) => {
    const store = scheduledStore();
    const lead = 80 * DAY_MS;
    const j = job({ sendAfter: Date.now() + lead, dated: true });
    await store.create(j);
    const next = { chainId: j.chainId, proof: "0xfeed" as Hex, root: hex32(0x9999), nullifier: j.nullifier, asset: j.asset, to: j.to, amount: j.amount };
    const out = await replaceJobProof(store, j.id, next, Date.now());
    assert.equal(out.ok, true);
    const rec = `gloam:cashout:job:${j.id}`;
    assert.ok(r.ttls.get(rec)! * 1000 > lead, `ttl ${r.ttls.get(rec)}s`);
    assert.ok(r.ttls.get(`gloam:cashout:nf:${j.chainId}:${j.nullifier}`)! * 1000 > lead);
    assert.equal(JSON.parse(r.kv.get(rec)!).dated, true, "still dated");
    assert.equal(JSON.parse(r.kv.get(rec)!).sendAfter, j.sendAfter, "same send time");
  });
});

await test("in Redis a finished job goes back to the short record, without its proof", async () => {
  await withRedis(async (r) => {
    const store = scheduledStore();
    const j = job({ sendAfter: Date.now() + 40 * DAY_MS, dated: true });
    await store.create(j);
    assert.equal(await cancelJob(store, j.id, Date.now()), "cancelled");
    const rec = `gloam:cashout:job:${j.id}`;
    assert.equal(r.ttls.get(rec), JOB_DONE_TTL_SEC);
    assert.equal(JSON.parse(r.kv.get(rec)!).proof, "0x");
    assert.equal(r.zset.has(j.id), false, "out of the queue");
  });
});

// ---------------------------------------------------------------- the runner

class SendError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
  }
}

function fakeChain() {
  const spent = new Set<string>();
  const sends: string[] = [];
  let nextFail: string | null = null;
  const c = {
    now: T0,
    spent,
    sends,
    failNext: (code: string | null) => {
      nextFail = code;
    },
    deps: {
      now: () => c.now,
      readChain: async (j: CashOutJob): Promise<ChainView> => ({ spent: spent.has(j.nullifier), knownRoot: true }),
      send: async (j: CashOutJob): Promise<Hex> => {
        sends.push(j.id);
        if (nextFail) throw new SendError("passing", nextFail);
        spent.add(j.nullifier);
        return hex32(0xbeef);
      },
    },
  };
  return c;
}

await test("a job months out is left alone until its time, then goes out once", async () => {
  const j = job({ sendAfter: T0 + 60 * DAY_MS, dated: true });
  const store = memoryJobStore();
  const chain = fakeChain();
  await store.put(j);
  for (const t of [T0, T0 + DAY_MS, T0 + 59 * DAY_MS, j.sendAfter - 1]) {
    chain.now = t;
    assert.deepEqual(await runDueJobs(store, chain.deps), []);
  }
  chain.now = j.sendAfter;
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: j.id, status: "sent" }]);
  assert.equal((await store.get(j.id))!.proof, "0x");
  assert.equal(chain.sends.length, 1);
});

await test("a job can be cancelled, or its proof renewed, months ahead", async () => {
  const store = memoryJobStore();
  const a = job({ sendAfter: T0 + 60 * DAY_MS, dated: true });
  await store.put(a);
  assert.equal(await cancelJob(store, a.id, T0), "cancelled");
  assert.equal((await store.get(a.id))!.proof, "0x", "the relay no longer holds a proof it could send");
  const b = job({ sendAfter: T0 + 60 * DAY_MS, dated: true });
  await store.put(b);
  const r = await replaceJobProof(store, b.id, { chainId: b.chainId, proof: "0xfeed" as Hex, root: hex32(7), nullifier: b.nullifier, asset: b.asset, to: b.to, amount: b.amount }, T0);
  assert.equal(r.ok, true);
  const after = (await store.get(b.id))!;
  assert.deepEqual([after.sendAfter, after.dated, after.proof], [b.sendAfter, true, "0xfeed"]);
});

await test("nobody is at the screen for a dated job: a passing problem gets a day, not 2 hours", async () => {
  const j = job({ sendAfter: T0, dated: true });
  const store = memoryJobStore();
  const chain = fakeChain();
  await store.put(j);
  chain.failNext("relay_empty");
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: j.id, status: "scheduled" }]);
  assert.equal((await store.get(j.id))!.notBefore, T0 + DATED_RETRY_MS, "tried again in a few minutes");
  chain.now = T0 + 1_000;
  assert.deepEqual(await runDueJobs(store, chain.deps), [], "not on the next pass");

  chain.now = T0 + GIVE_UP_AFTER_MS + 1;
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: j.id, status: "scheduled" }], "past where a cash out in a window gives up");
  chain.now = T0 + DATED_GIVE_UP_AFTER_MS + 1;
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: j.id, status: "failed" }]);

  // and if the relay is back in time, it goes out
  const k = job({ sendAfter: T0, dated: true });
  const s2 = memoryJobStore();
  const c2 = fakeChain();
  await s2.put(k);
  c2.failNext("relay_empty");
  await runDueJobs(s2, c2.deps);
  c2.failNext(null);
  c2.now = T0 + DATED_RETRY_MS;
  assert.deepEqual(await runDueJobs(s2, c2.deps), [{ id: k.id, status: "sent" }]);
});

await test("a cash out in a window still gives up after 2 hours, retrying on the next pass", async () => {
  const j = job({ sendAfter: T0 });
  const store = memoryJobStore();
  const chain = fakeChain();
  await store.put(j);
  chain.failNext("busy");
  await runDueJobs(store, chain.deps);
  assert.equal((await store.get(j.id))!.notBefore, undefined);
  chain.now = T0 + GIVE_UP_AFTER_MS + 1;
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: j.id, status: "failed" }]);
});

await test("retrying dated jobs never crowd out what is due now", async () => {
  const stuck = Array.from({ length: 25 }, () => job({ sendAfter: T0 - 60_000, dated: true }));
  const store = memoryJobStore();
  const chain = fakeChain();
  for (const j of stuck) await store.put(j);
  chain.failNext("busy");
  await runDueJobs(store, chain.deps, 25);
  chain.failNext(null);
  const fresh = job({ sendAfter: T0 + 1_000 });
  await store.put(fresh);
  chain.now = T0 + 1_000;
  assert.deepEqual(await runDueJobs(store, chain.deps), [{ id: fresh.id, status: "sent" }]);
});

await test("a job waiting for gas keeps its record and still gives up with nothing moved", async () => {
  const j = job({ sendAfter: T0, dated: true });
  const store = memoryJobStore();
  const chain = fakeChain();
  await store.put(j);
  const deps = { ...chain.deps, gasHigh: async () => true };
  assert.deepEqual(await runDueJobs(store, deps), [{ id: j.id, status: "scheduled" }]);
  chain.now = T0 + GAS_WAIT_MAX_MS + 1;
  assert.deepEqual(await runDueJobs(store, deps), [{ id: j.id, status: "failed" }]);
  assert.equal(chain.sends.length, 0);
});

// ---------------------------------------------------------------- the relay's route, against a fake node

const net = getActiveNetwork();
assert.ok(net.pool);
const RPC = net.chain.rpcUrls.default.http[0];
const SEL = { spent: toFunctionSelector("spent(bytes32)"), isKnownRoot: toFunctionSelector("isKnownRoot(bytes32)") };
const word = (b: boolean) => "0x" + (b ? "1" : "0").padStart(64, "0");
const Z32 = "0x" + "00".repeat(32);
const BLOCK = {
  number: "0x7",
  hash: "0x" + "12".repeat(32),
  parentHash: Z32,
  nonce: "0x0000000000000000",
  sha3Uncles: Z32,
  logsBloom: "0x" + "00".repeat(256),
  transactionsRoot: Z32,
  stateRoot: Z32,
  receiptsRoot: Z32,
  miner: "0x" + "00".repeat(20),
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x1",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  timestamp: "0x1",
  baseFeePerGas: "0x1",
  transactions: [],
  uncles: [],
};
type RpcReq = { id: number; method: string; params?: unknown[] };
function answer(r: RpcReq): { result?: unknown; error?: { code: number; message: string } } {
  switch (r.method) {
    case "eth_chainId":
      return { result: toHex(net.chainId) };
    case "eth_blockNumber":
      return { result: "0x7" };
    case "eth_getBlockByNumber":
      return { result: BLOCK };
    case "eth_getTransactionCount":
      return { result: "0x0" };
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return { result: "0x1" };
    case "eth_getBalance":
      return { result: toHex(10n ** 18n) };
    case "eth_estimateGas":
      return { result: "0x1b7740" };
    case "eth_call": {
      const sel = String((r.params?.[0] as { data?: string }).data).slice(0, 10);
      if (sel === SEL.spent) return { result: word(false) };
      if (sel === SEL.isKnownRoot) return { result: word(true) };
      return { error: { code: -32000, message: `fake node: unknown call ${sel}` } };
    }
    default:
      return { error: { code: -32601, message: `fake node: ${r.method} not handled` } };
  }
}

/** What the next POSTs to the relay do instead of reaching it: "down", or a status and body. */
const replies: ("down" | { status: number; body: object })[] = [];
const asked: Record<string, unknown>[] = [];
const callRoute = (method: string, url: string, init?: RequestInit, ip = "10.1.1.1") =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, ...(init?.body ? { body: init.body } : {}) });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("/api/relay/scheduled")) {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      asked.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const r = replies.shift();
      if (r === "down") throw new TypeError("fetch failed");
      if (r) return new Response(JSON.stringify(r.body), { status: r.status });
      // each batch from its own address, so the route's limits are not what these tests are about
      return route.POST(callRoute(method, url, init, `10.3.${(asked.length >> 8) & 255}.${asked.length & 255}`));
    }
    if (method === "DELETE") return route.DELETE(callRoute(method, url, init));
    if (method === "GET") return route.GET(callRoute(method, url, init));
    throw new Error(`selftest: unexpected ${method} ${url}`);
  }
  if (url.replace(/\/$/, "") !== RPC.replace(/\/$/, "")) throw new Error(`selftest: no network (${url})`);
  const body = JSON.parse(String(init?.body)) as RpcReq | RpcReq[];
  const list = Array.isArray(body) ? body : [body];
  const out = list.map((r) => ({ jsonrpc: "2.0", id: r.id, ...answer(r) }));
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

let nfSeq = 0x7000;
const scheduleBody = (over: Record<string, unknown> = {}) => ({
  chainId: net.chainId,
  proof: PROOF,
  root: hex32(0x77),
  nullifier: hex32(++nfSeq),
  asset: ASSET,
  to: AGENT,
  amount: "5000000",
  ...over,
});
type Answer = { ok?: boolean; id?: string; sendAfter?: number; to?: string; code?: string; error?: string; status?: string };
const post = async (payload: object, ip: string) => {
  const r = await route.POST(callRoute("POST", "/api/relay/scheduled", { body: JSON.stringify(payload) }, ip));
  return { status: r.status, json: (await r.json()) as Answer };
};
const tomorrow = () => dayOf(Date.now()) + DAY_MS;
const store = scheduledStore();

await test("the route takes a day, and draws the send time inside it", async () => {
  const day = tomorrow() + 13 * DAY_MS;
  const r = await post(scheduleBody({ day }), "10.2.0.1");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.sendAfter! >= day && r.json.sendAfter! < day + DAY_MS);
  const saved = (await store.get(r.json.id!))!;
  assert.equal(saved.dated, true);
  assert.equal(saved.sendAfter, r.json.sendAfter);
  assert.equal(saved.to.toLowerCase(), AGENT.toLowerCase());
});

await test("the route refuses a bad day, and both a window and a day", async () => {
  for (const bad of [{ day: 123 }, { day: "tomorrow" }, { day: dayOf(Date.now()) - DAY_MS }, { day: dayOf(Date.now()) + (MAX_DATED_DAYS + 1) * DAY_MS }, { day: tomorrow(), window: "hour" }]) {
    const r = await post(scheduleBody(bad), "10.2.0.2");
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json.ok, false);
  }
  assert.equal((await post(scheduleBody({}), "10.2.0.2")).status, 400, "neither");
  assert.equal((await post(scheduleBody({ window: "week" }), "10.2.0.2")).status, 400, "no new window");
});

await test("a job in a window through the route is exactly what it was: not dated, inside its window", async () => {
  const before = Date.now();
  const r = await post(scheduleBody({ window: "6h" }), "10.2.0.3");
  assert.equal(r.status, 200);
  const saved = (await store.get(r.json.id!))!;
  assert.equal(saved.dated, undefined);
  assert.ok(saved.sendAfter >= before + MIN_DELAY_MS && saved.sendAfter < Date.now() + DELAY_WINDOWS["6h"]);
});

await test("asking again for the same top-up returns the job already waiting, on its own day", async () => {
  const body = scheduleBody({ day: tomorrow() + 7 * DAY_MS });
  const first = await post(body, "10.2.0.4");
  const again = await post({ ...body, day: tomorrow() + 21 * DAY_MS }, "10.2.0.4");
  assert.equal(again.json.id, first.json.id);
  assert.equal(again.json.sendAfter, first.json.sendAfter);
  const other = await post({ ...body, to: "0x2222222222222222222222222222222222222222", day: tomorrow() }, "10.2.0.4");
  assert.equal(other.status, 409);
  assert.equal(other.json.code, "already_scheduled");
});

await test("a batch of 12 fits, a second one does, and the limit still holds past that", async () => {
  const realNow = Date.now;
  const start = dayOf(realNow()) + 60 * 60 * 1000 + 1;
  Date.now = () => start;
  try {
    const ip = "10.2.0.5";
    const day = dayOf(start) + 7 * DAY_MS;
    for (let i = 0; i < 24; i++) assert.equal((await post(scheduleBody({ day }), ip)).status, 200, `top-up ${i + 1}`);
    const over = await post(scheduleBody({ day }), ip);
    assert.deepEqual([over.status, over.json.code], [429, "rate_limit"]);
    // counted apart: an ordinary cash out in the same hour still goes, and uses up nothing of the batch's
    assert.equal((await post(scheduleBody({ window: "hour" }), ip)).status, 200);
    // and the other way: a full hour of ordinary cash outs doesn't stop a batch
    const busy = "10.2.0.6";
    for (let i = 0; i < 20; i++) assert.equal((await post(scheduleBody({ window: "day" }), busy)).status, 200);
    assert.equal((await post(scheduleBody({ window: "day" }), busy)).status, 429, "their limit is the same 20");
    for (let i = 0; i < 12; i++) assert.equal((await post(scheduleBody({ day }), busy)).status, 200);

    // a day's cap on top: these stay on record for months
    Date.now = () => start + 60 * 60 * 1000;
    for (let i = 0; i < 24; i++) assert.equal((await post(scheduleBody({ day }), ip)).status, 200, `next hour ${i + 1}`);
    Date.now = () => start + 2 * 60 * 60 * 1000;
    assert.equal((await post(scheduleBody({ day }), ip)).status, 429, "48 a day from one sender");
  } finally {
    Date.now = realNow;
  }
});

await test("a job can only be read or cancelled with its id, and reading it shows no proof, amount or address", async () => {
  const r = await post(scheduleBody({ day: tomorrow() + 14 * DAY_MS }), "10.2.0.7");
  const id = r.json.id!;
  const read = await route.GET(callRoute("GET", `/api/relay/scheduled?id=${id}`));
  const seen = (await read.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(seen).sort(), ["chainId", "id", "ok", "sendAfter", "status", "updatedAt"]);
  const stranger = "00000000-0000-4000-8000-00000000abcd";
  assert.equal((await route.GET(callRoute("GET", `/api/relay/scheduled?id=${stranger}`))).status, 404);
  assert.equal((await route.DELETE(callRoute("DELETE", `/api/relay/scheduled?id=${stranger}`))).status, 404);
  assert.equal((await route.DELETE(callRoute("DELETE", `/api/relay/scheduled?id=nope`))).status, 400);
  assert.equal((await route.DELETE(callRoute("DELETE", `/api/relay/scheduled`))).status, 400, "no id, no list");
  assert.equal((await store.get(id))!.status, "scheduled", "none of that touched it");
  // an id is unguessable: a random UUID, handed only to whoever scheduled it, and kept in their encrypted notes
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(jobView((await store.get(id))!).hash, undefined);
});

// ---------------------------------------------------------------- the series

const active = net;
const FEE_BPS = 25;

await test("how far a series can run: 12 weekly, and every 2 weeks only as far as the relay holds one", () => {
  assert.equal(mostTopUps("week"), 12);
  assert.equal(mostTopUps("2weeks"), 7);
  const now = T0;
  for (const every of ["week", "2weeks"] as const) {
    const days = topUpDays(now, every, mostTopUps(every));
    assert.equal(days[0], dayOf(now) + DAY_MS, "the first goes tomorrow");
    for (const d of days) assert.equal(sendDayProblem(d, now), null, `${every} ${d}`);
    for (let i = 1; i < days.length; i++) assert.equal(days[i]! - days[i - 1]!, TOP_UP_EVERY[every] * DAY_MS);
    // the longest series still fits with the setup running up to a day late
    assert.equal(sendDayProblem(days.at(-1)!, now + DAY_MS - 1), null);
  }
  assert.equal(TOP_UPS_MAX, 12);
});

await test("the fee comes out of each top-up; the whole total is set aside", () => {
  assert.deepEqual(topUpTotals(50n * U, 12, FEE_BPS), { total: 600n * U, feeEach: 125_000n, agentGets: 49_875_000n });
  assert.deepEqual(topUpTotals(50n * U, 2, 0), { total: 100n * U, feeEach: 0n, agentGets: 50n * U });
  assert.equal(topUpAmountProblem(U, 6), null);
  assert.ok(topUpAmountProblem(U - 1n, 6));
});

let leaf = 100;
function vaultNote(id: string, wei: bigint, over: Partial<LocalNote> = {}): LocalNote {
  const n = id.length * 7 + (leaf += 3);
  const note: LocalNote = {
    id,
    chainId: active.chainId,
    pool: active.pool!,
    asset: ASSET,
    amountWei: wei.toString(),
    commitment: hex32(0x500000 + n),
    secret: hex32(0x600000 + n),
    nullifier: hex32(0x700000 + n),
    createdAt: T0,
    bound: true,
    scheme: "poseidon",
    status: "open",
    source: "local",
    leafIndex: n,
    ...over,
  };
  saveLocalNote(note);
  return note;
}
const byId = (id: string) => getAllNotes().find((n) => n.id === id)!;
const spendable = (ids: string[]) => activeSpendableNotes(getAllNotes()).filter((n) => ids.includes(n.id));
const total = (ns: LocalNote[]) => sum(ns.map((n) => BigInt(n.amountWei)));
const PATH = { leafIndex: 0 } as unknown as PoseidonMerklePath;

/** Saves its notes the way lib/cashOutSplit does. `fail` stops before the send, `maybe` after it, `close` as a tab closing. */
function fakeSplitter() {
  let calls = 0;
  const plan: Record<number, "fail" | "maybe" | "close"> = {};
  const created: string[] = [];
  async function split(a: SplitArgs): Promise<{ part: LocalNote; change: LocalNote | null }> {
    const call = ++calls;
    const base = (leaf += 11) * 1000;
    const whole = BigInt(a.note.amountWei);
    const out = (k: number, amt: bigint) => ({
      amountWei: amt.toString(),
      commitment: hex32(0xe0000000 + base + k),
      secret: hex32(0xf0000000 + base + k),
      nullifier: hex32(0x100000000 + base + k),
    });
    const w = { paymentNote: out(1, a.amount), changeNote: out(2, whole - a.amount) } as never;
    const both = splitNotes(a.note, w, a.note.nullifier!, a.owner, T0 + base);
    const part = a.partTag ? { ...both.part, cashOutPlan: a.partTag } : both.part;
    const change = both.change && a.changeTag ? { ...both.change, cashOutPlan: a.changeTag } : both.change;
    if (plan[call] === "fail") throw new Error("The relay is busy. Try again shortly or send from your wallet.");
    await saveLocalNote({ ...part, sweepPending: true });
    if (change) await saveLocalNote({ ...change, sweepPending: true });
    created.push(part.id, ...(change ? [change.id] : []));
    if (plan[call] === "maybe") throw new Error(SPLIT_MAYBE_SENT);
    if (plan[call] === "close") throw new Error("tab closed");
    const hash = hex32(0x20000 + base);
    updateLocalNote(a.note.id, { status: "recovered", txHash: hash });
    updateLocalNote(part.id, { sweepPending: false, txHash: hash, leafIndex: (leaf += 1) });
    if (change) updateLocalNote(change.id, { sweepPending: false, txHash: hash, leafIndex: (leaf += 1) });
    return { part: byId(part.id), change: change ? byId(change.id) : null };
  }
  return { split, plan, created, calls: () => calls };
}

let planSeq = 0;
function deps(s: ReturnType<typeof fakeSplitter>, proveFailsOn?: number) {
  return {
    pathOf: async () => PATH,
    split: s.split,
    prove: async (n: LocalNote, to: Address) => {
      if (proveFailsOn && n.cashOutPlan?.piece === proveFailsOn) throw new Error("This balance does not match the vault.");
      return { chainId: n.chainId, proof: PROOF, root: hex32(0x77), nullifier: n.nullifier!, asset: n.asset, to, amount: BigInt(n.amountWei) };
    },
    schedule: scheduleNoteCashOut,
    newId: () => `series-${++planSeq}`,
  };
}
function reset() {
  replies.length = 0;
  asked.length = 0;
}
const AMOUNT = 50n * U;
const start = (note: LocalNote, s: ReturnType<typeof fakeSplitter>, count = 12, proveFailsOn?: number, every: "week" | "2weeks" = "week") =>
  setUpTopUps({ note, owner: ME, agent: AGENT, amount: AMOUNT, every, count, deps: deps(s, proveFailsOn) });
/** Every coin of a series, wherever it is now. */
const accounted = (s: ReturnType<typeof fakeSplitter>) => {
  const mine = s.created.map(byId).filter((n) => n && n.status !== "recovered");
  return {
    balance: total(activeSpendableNotes(mine)),
    waiting: total(mine.filter(cashOutPending)),
    landing: total(mine.filter((n) => n.sweepPending)),
  };
};

await test("12 top-ups from a note of exactly that much: 11 splits, each to the agent on its own day, none in the balance", async () => {
  reset();
  const src = vaultNote("dep-1", 600n * U);
  const s = fakeSplitter();
  const r = await start(src, s);
  assert.equal(r.stoppedAt, null, r.error ?? "");
  assert.equal(r.jobs.length, 12);
  assert.equal(s.calls(), 11, "the last top-up is the last split's change");
  assert.equal(byId(src.id).status, "recovered");

  const days = topUpDays(Date.now(), "week", 12);
  assert.deepEqual(asked.map((b) => b.day), days, "each handed over for its own day");
  assert.ok(asked.every((b) => b.window === undefined && String(b.to).toLowerCase() === AGENT.toLowerCase() && b.amount === AMOUNT.toString()));
  r.jobs.forEach((j, i) => assert.ok(j.sendAfter >= days[i]! && j.sendAfter < days[i]! + DAY_MS, `job ${i}`));

  const rows = topUpRows(getAllNotes()).filter((x) => s.created.includes(x.note.id));
  assert.deepEqual(rows.map((x) => x.piece), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(rows.every((x) => x.state === "upcoming" && x.of === 12));
  assert.equal(new Set(rows.map((x) => x.note.cashOutPlan!.plan)).size, 1, "one series");
  assert.deepEqual(accounted(s), { balance: 0n, waiting: 600n * U, landing: 0n }, "nothing counted while it waits");
  assert.equal(topUpSetAside(rows).get(ASSET.toLowerCase()), 600n * U);
  assert.deepEqual(unscheduledPieces().filter((n) => s.created.includes(n.id)), []);
});

await test("from a bigger note: one split each, and the rest stays plain money in the balance", async () => {
  reset();
  const src = vaultNote("dep-2", 1_000n * U);
  const s = fakeSplitter();
  const r = await start(src, s, 4);
  assert.equal(r.stoppedAt, null);
  assert.equal(s.calls(), 4);
  assert.deepEqual(accounted(s), { balance: 800n * U, waiting: 200n * U, landing: 0n });
  const left = spendable(s.created);
  assert.equal(left.length, 1);
  assert.equal(left[0]!.cashOutPlan, undefined, "the rest is not a top-up");
});

await test("a split refused midway: the earlier ones still go, nothing lost, and the series can be finished", async () => {
  reset();
  const src = vaultNote("dep-3", 600n * U);
  const s = fakeSplitter();
  s.plan[6] = "fail";
  const r = await start(src, s);
  assert.equal(r.stoppedAt, 5);
  assert.equal(r.jobs.length, 5);
  assert.equal(r.maybeSent, false);
  assert.match(r.error!, /busy/);
  assert.equal(s.calls(), 6, "nothing tried past the problem");
  assert.deepEqual(accounted(s), { balance: 350n * U, waiting: 250n * U, landing: 0n }, "every coin accounted for, once");

  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.deepEqual(series.missing.map((m) => m.piece), [6, 7, 8, 9, 10, 11, 12]);
  assert.equal(series.of, 12);
  assert.equal(series.amount, AMOUNT);
  assert.deepEqual([series.scheduled, series.settling], [5, false]);
  const days = topUpDays(Date.now(), "week", 12);
  assert.deepEqual(series.missing.map((m) => m.day), days.slice(5), "their days follow from the ones made");

  // finished from the rest, in the same series
  const rest = pickTopUpNote(spendable(s.created), ASSET, 350n * U)!;
  assert.equal(BigInt(rest.amountWei), 350n * U);
  const again = fakeSplitter();
  const f = await finishTopUps({ note: rest, owner: ME, series, deps: deps(again) });
  assert.equal(f.stoppedAt, null, f.error ?? "");
  assert.equal(f.jobs.length, 7);
  assert.deepEqual(asked.slice(-7).map((b) => b.day), days.slice(5));
  const done = topUpSeries(getAllNotes(), Date.now()).find((x) => x.id === series.id)!;
  assert.deepEqual(done.rows.map((x) => x.piece), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(done.missing, []);
  assert.equal(done.scheduled, 12);
  assert.equal(topUpSetAside(done.rows).get(ASSET.toLowerCase()), 600n * U);
  assert.equal(byId(rest.id).status, "recovered");
});

await test("finishing with one top-up left, from a note of just that size: it is still tagged, and still a fresh note", async () => {
  reset();
  const src = vaultNote("dep-3b", 1_000n * U);
  const s = fakeSplitter();
  s.plan[2] = "fail";
  await start(src, s, 2);
  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.deepEqual(series.missing.map((m) => m.piece), [2]);
  const exact = vaultNote("dep-3c", 50n * U, { fundsProofAt: T0 });
  const again = fakeSplitter();
  const f = await finishTopUps({ note: exact, owner: ME, series, deps: deps(again) });
  assert.equal(f.stoppedAt, null, f.error ?? "");
  assert.equal(again.calls(), 1, "moved to a fresh note, so a note that backed a proof of funds never shows next to the cash out");
  const made = byId(again.created[0]!);
  assert.equal(made.cashOutPlan!.piece, 2);
  assert.equal(made.cashOutPlan!.plan, series.id);
  assert.equal(topUpState(made), "upcoming");
});

await test("a split that may have gone out: both notes kept out of the balance, and never offered again", async () => {
  reset();
  const src = vaultNote("dep-4", 600n * U);
  const s = fakeSplitter();
  s.plan[4] = "maybe";
  const r = await start(src, s);
  assert.equal(r.stoppedAt, 3);
  assert.equal(r.maybeSent, true);
  assert.equal(r.error, SPLIT_MAYBE_SENT);
  // the note it spends still counts until the sync settles it; the two it made stay out of the balance
  assert.deepEqual(accounted(s), { balance: 450n * U, waiting: 150n * U, landing: 450n * U });
  const rows = topUpRows(getAllNotes()).filter((x) => s.created.includes(x.note.id));
  assert.equal(rows.find((x) => x.piece === 4)!.state, "landing");
  assert.equal(topUpSetAside(rows).get(ASSET.toLowerCase()), 150n * U, "still landing: not called set aside yet");
  const landing = s.created.map(byId).filter((n) => n.sweepPending);
  assert.equal(landing.length, 2);
  assert.equal(pickTopUpNote(landing, ASSET, 1n), null, "neither is offered to split from");
  // a run never guesses past a stop: finishing waits for the sync, and only what the relay holds counts as scheduled
  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.deepEqual([series.scheduled, series.settling], [3, true]);
});

await test("the relay down at scheduling: the top-up stays in the balance, shows, and goes for its own day when scheduled again", async () => {
  reset();
  const src = vaultNote("dep-5", 600n * U);
  const s = fakeSplitter();
  const r0 = deps(s);
  let n = 0;
  const schedule: typeof r0.schedule = async (note, call, when) => {
    if (++n === 3) replies.push("down");
    return scheduleNoteCashOut(note, call, when);
  };
  const r = await setUpTopUps({ note: src, owner: ME, agent: AGENT, amount: AMOUNT, every: "week", count: 12, deps: { ...r0, schedule } });
  assert.equal(r.stoppedAt, 2);
  assert.equal(r.error, "Could not reach the relay. Check your connection.");
  const left = unscheduledPieces().filter((x) => s.created.includes(x.id));
  assert.deepEqual(left.map((x) => x.cashOutPlan!.piece), [3]);
  assert.deepEqual(accounted(s), { balance: 500n * U, waiting: 100n * U, landing: 0n });
  assert.equal(topUpState(left[0]!), "unscheduled");
  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.equal(series.scheduled, 2, "a top-up not handed to the relay is not called scheduled");

  const day = left[0]!.cashOutPlan!.topUp!.day;
  const job = await schedulePiece(left[0]!, { pathOf: async () => PATH, prove: r0.prove });
  assert.equal(asked.at(-1)!.day, day);
  assert.equal(asked.at(-1)!.window, undefined);
  assert.ok(job.sendAfter >= day && job.sendAfter < day + DAY_MS);
  assert.equal(topUpState(byId(left[0]!.id)), "upcoming");
  assert.deepEqual(accounted(s), { balance: 450n * U, waiting: 150n * U, landing: 0n });
});

await test("a top-up scheduled again after its day passed goes tomorrow, not never", async () => {
  reset();
  const yesterday = dayOf(Date.now()) - DAY_MS;
  const n = vaultNote("dep-6", 50n * U, { cashOutPlan: { plan: "p6", piece: 1, of: 2, to: AGENT, window: "day", topUp: { day: yesterday, everyDays: 7 } } });
  const job = await schedulePiece(n, { pathOf: async () => PATH, prove: deps(fakeSplitter()).prove });
  assert.equal(asked.at(-1)!.day, dayOf(Date.now()) + DAY_MS);
  assert.ok(job.sendAfter >= dayOf(Date.now()) + DAY_MS);
});

await test("a proof that fails, and a rate limit midway: each stops the run with the money safe", async () => {
  reset();
  const src = vaultNote("dep-7", 600n * U);
  const s = fakeSplitter();
  const r = await start(src, s, 12, 3);
  assert.equal(r.stoppedAt, 2);
  assert.equal(r.jobs.length, 2);
  assert.deepEqual(unscheduledPieces().filter((x) => s.created.includes(x.id)).map((x) => x.cashOutPlan!.piece), [3]);
  assert.deepEqual(accounted(s), { balance: 500n * U, waiting: 100n * U, landing: 0n });

  reset();
  const src2 = vaultNote("dep-8", 600n * U);
  const s2 = fakeSplitter();
  const d = deps(s2);
  let k = 0;
  const schedule: typeof d.schedule = async (note, call, when) => {
    if (++k === 9) replies.push({ status: 429, body: { ok: false, code: "rate_limit", error: "Too many scheduled cash outs from this device. Wait a while." } });
    return scheduleNoteCashOut(note, call, when);
  };
  const r2 = await setUpTopUps({ note: src2, owner: ME, agent: AGENT, amount: AMOUNT, every: "week", count: 12, deps: { ...d, schedule } });
  assert.equal(r2.stoppedAt, 8);
  assert.match(r2.error!, /Too many/);
  assert.deepEqual(accounted(s2), { balance: 200n * U, waiting: 400n * U, landing: 0n });
});

await test("a closed tab mid-split: the notes are kept, the next sync lands them, and the top-up shows as not scheduled", async () => {
  reset();
  const src = vaultNote("dep-9", 600n * U);
  const s = fakeSplitter();
  s.plan[1] = "close";
  const r = await start(src, s);
  assert.equal(r.stoppedAt, 0);
  const everything = () => [src.id, ...s.created];
  assert.equal(total(spendable(everything())), 600n * U, "the original still counts, once");
  const part = s.created.map(byId).find((n) => n.cashOutPlan)!;
  assert.equal(part.secret !== "0x" && part.secret.length, 66, "its secret was saved before anything was sent");
  const env = {
    chainId: active.chainId,
    pool: active.pool!,
    stateAt: async () => ({ spent: true, seen: true, block: 1n }),
    leafIndexOf: async () => (leaf += 1),
  } as unknown as ClaimEnv;
  assert.equal(await reconcileClaims(env), true);
  assert.equal(byId(src.id).status, "recovered");
  assert.equal(total(spendable(everything())), 600n * U, "counted once: the two new notes");
  assert.deepEqual(unscheduledPieces().filter((n) => s.created.includes(n.id)).map((n) => n.cashOutPlan!.piece), [1]);
  // the slots never reached show too, and the change is what can finish them
  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.equal(series.missing.length, 11);
});

await test("a note whose swap just reverted waits, like any cash out, then a series moves it to fresh notes", async () => {
  reset();
  const held = vaultNote("swap-1", 200n * U, { swapProofAt: Date.now() });
  const s = fakeSplitter();
  await assert.rejects(start(held, s, 4), /moving to a fresh private balance/);
  assert.equal(s.calls(), 0, "nothing moved");
  assert.equal(byId(held.id).status, "open");
  assert.equal(asked.length, 0);

  // once the relay takes it: every top-up comes from a split, which ends that swap's proof
  const ready = vaultNote("swap-2", 200n * U, { swapProofAt: Date.now() - RELAY_SPEND_LOCK_MS - 1 });
  const s2 = fakeSplitter();
  const r = await start(ready, s2, 4);
  assert.equal(r.stoppedAt, null, r.error ?? "");
  assert.equal(s2.calls(), 3);
  assert.equal(byId(ready.id).status, "recovered");
  assert.ok(s2.created.map(byId).every((n) => !n.swapProofAt), "the proof stays behind on the spent note");
});

await test("the series comes out of the smallest note that covers it, never one that's busy", () => {
  const notes = [
    vaultNote("pick-1", 100n * U),
    vaultNote("pick-2", 300n * U),
    vaultNote("pick-3", 900n * U),
    vaultNote("pick-4", 5_000n * U, { cashOut: { job: "j", at: T0, to: AGENT, state: "scheduled" } }),
    vaultNote("pick-5", 6_000n * U, { sweepPending: true }),
    vaultNote("pick-6", 7_000n * U, { asset: AGENT }),
    vaultNote("pick-7", 8_000n * U, { status: "recovered" }),
    vaultNote("pick-8", 9_000n * U, { cashOutPlan: { plan: "p", piece: 1, of: 2, to: AGENT, window: "day", topUp: { day: T0, everyDays: 7 } } }),
    vaultNote("pick-9", 200n * U, { cashOut: { job: "j", at: T0, to: AGENT, state: "failed" } }),
  ];
  assert.equal(pickTopUpNote(notes, ASSET, 250n * U)!.id, "pick-2");
  assert.equal(pickTopUpNote(notes, ASSET, 150n * U)!.id, "pick-9", "one that came back is plain money");
  assert.equal(pickTopUpNote(notes, ASSET.toUpperCase().replace("0X", "0x"), 150n * U)!.id, "pick-9");
  assert.equal(pickTopUpNote(notes, ASSET, 901n * U), null, "a series comes out of one note");
  assert.equal(largestTopUpNote(notes, ASSET), 900n * U);
});

// ---------------------------------------------------------------- after setup

/** A series of `count` already scheduled, for the tests below. */
async function live(count = 3) {
  reset();
  const s = fakeSplitter();
  const src = vaultNote(`dep-live-${++leaf}`, 50n * U * BigInt(count));
  const r = await start(src, s, count);
  assert.equal(r.stoppedAt, null, r.error ?? "");
  return { s, rows: topUpRows(getAllNotes()).filter((x) => s.created.includes(x.note.id)) };
}

await test("cancelling a top-up makes its note spendable again, and it stays on the list as cancelled", async () => {
  const { s, rows } = await live(3);
  const target = rows[1]!.note;
  assert.equal(await cancelTopUp(target), null);
  const after = byId(target.id);
  assert.equal(after.cashOut, undefined);
  assert.equal(topUpState(after), "cancelled");
  assert.deepEqual(spendable(s.created).map((n) => n.id), [target.id], "spendable, once");
  assert.ok(!unscheduledPieces().some((n) => n.id === target.id), "not a top-up still to schedule");
  assert.equal(accounted(s).waiting, 100n * U);
  assert.equal(topUpSetAside(topUpRows(getAllNotes()).filter((x) => s.created.includes(x.note.id))).get(ASSET.toLowerCase()), 100n * U);
  // the relay holds no proof for it any more
  assert.equal((await store.get(rows[1]!.note.cashOut!.job))!.proof, "0x");
  // a series with a cancelled slot does not offer it back
  const series = topUpSeries(getAllNotes(), Date.now()).find((x) => x.rows.some((y) => s.created.includes(y.note.id)))!;
  assert.deepEqual(series.missing, []);
  // and that note can fund a new series
  assert.equal(pickTopUpNote(spendable(s.created), ASSET, 50n * U)!.id, target.id);
});

await test("cancel from Pay does the same; an ordinary piece still drops its tag", async () => {
  const { rows } = await live(2);
  cancelledPiece(rows[0]!.note.id);
  assert.equal(topUpState(byId(rows[0]!.note.id)), "cancelled");
  const plain = vaultNote("plain-1", 5n * U, { cashOutPlan: { plan: "p", piece: 1, of: 2, to: AGENT, window: "6h" } });
  cancelledPiece(plain.id);
  assert.equal(byId(plain.id).cashOutPlan, undefined);
  assert.equal(endedPlan(undefined, "kept"), undefined);
  const kept = vaultNote("plain-2", 5n * U, { cashOutPlan: { plan: "p", piece: 2, of: 2, to: AGENT, window: "6h" } });
  keepPiece(kept.id);
  assert.equal(byId(kept.id).cashOutPlan, undefined);
});

await test("keeping a top-up that wasn't scheduled: plain money, on the record as cancelled", () => {
  const n = vaultNote("keep-1", 50n * U, { cashOutPlan: { plan: "pk", piece: 1, of: 2, to: AGENT, window: "day", topUp: { day: dayOf(Date.now()) + DAY_MS, everyDays: 7 } } });
  assert.ok(unscheduledPieces().some((x) => x.id === n.id));
  keepPiece(n.id);
  assert.ok(!unscheduledPieces().some((x) => x.id === n.id));
  assert.equal(topUpState(byId(n.id)), "cancelled");
  assert.equal(activeSpendableNotes(getAllNotes()).some((x) => x.id === n.id), true);
});

await test("a top-up already on its way can't be cancelled; a relay that can't be reached changes nothing", async () => {
  const { rows } = await live(2);
  const going = rows[0]!.note;
  const j = (await store.get(going.cashOut!.job))!;
  await store.put({ ...j, status: "sending", attempts: 1 });
  assert.match((await cancelTopUp(going))!, /already going out/);
  assert.equal(byId(going.id).cashOut!.state, "sent");
  assert.equal(topUpState(byId(going.id)), "going");

  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    assert.match((await cancelTopUp(rows[1]!.note))!, /could not be reached/);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(byId(rows[1]!.note.id).cashOut!.state, "scheduled");
});

function env(views: Record<string, unknown>, spent: Record<string, boolean | null>, now: number): CashOutEnv {
  return {
    chainId: active.chainId,
    pool: active.pool!,
    now: () => now,
    status: async (id) => (views[id] as never) ?? null,
    isSpent: async (nf) => (nf in spent ? spent[nf]! : null),
    receipt: async () => null,
  };
}
const dated = (id: string, wei: bigint, mark: Partial<NonNullable<LocalNote["cashOut"]>>) =>
  vaultNote(id, wei, {
    cashOutPlan: { plan: "pg", piece: 1, of: 2, to: AGENT, window: "day", topUp: { day: dayOf(T0), everyDays: 7 } },
    cashOut: { job: `job-${id}`, at: T0, to: AGENT, state: "scheduled", ...mark },
  });

await test("back after months: a top-up the relay no longer holds is settled from the chain", async () => {
  const later = T0 + 30 * DAY_MS;
  const unspent = dated("gone-1", 50n * U, {});
  const spent = dated("gone-2", 50n * U, {});
  const unread = dated("gone-3", 50n * U, {});
  const ahead = dated("gone-4", 50n * U, { at: later + 7 * DAY_MS });
  const plain = vaultNote("gone-5", 50n * U, { cashOut: { job: "job-gone-5", at: T0, to: AGENT, state: "scheduled" } });
  const views = Object.fromEntries(["gone-1", "gone-2", "gone-3", "gone-4", "gone-5"].map((id) => [`job-${id}`, "gone"]));
  const chain = { [unspent.nullifier!]: false, [spent.nullifier!]: true, [unread.nullifier!]: null, [ahead.nullifier!]: false, [plain.nullifier!]: false };
  assert.equal(await reconcileTopUps(env(views, chain, later)), true);

  assert.equal(byId(unspent.id).cashOut!.state, "failed", "it can never go out now, and nothing moved");
  assert.equal(topUpState(byId(unspent.id)), "returned");
  assert.ok(activeSpendableNotes(getAllNotes()).some((n) => n.id === unspent.id), "back in the balance");
  assert.ok(returnedCashOutNotes().some((n) => n.id === unspent.id), "with the usual notice");
  assert.equal(byId(spent.id).cashOut!.state, "sent", "the chain shows it went out");
  assert.ok(!activeSpendableNotes(getAllNotes()).some((n) => n.id === spent.id));
  assert.equal(byId(unread.id).cashOut!.state, "scheduled", "chain unread: left as it is");
  assert.equal(byId(ahead.id).cashOut!.state, "scheduled", "not past its time: left as it is");
  assert.equal(byId(plain.id).cashOut!.state, "scheduled", "an ordinary cash out keeps its rule: the chain settles it");
});

await test("a top-up that came back stays on the record after its notice is dismissed", () => {
  const n = dated("back-1", 50n * U, { state: "failed" });
  assert.equal(topUpState(n), "returned");
  dismissReturnedCashOut(n.id);
  assert.equal(byId(n.id).cashOut, undefined);
  assert.equal(topUpState(byId(n.id)), "returned");
  assert.ok(!unscheduledPieces().some((x) => x.id === n.id), "not one still to schedule");
  assert.ok(activeSpendableNotes(getAllNotes()).some((x) => x.id === n.id));
});

await test("each state of a top-up reads plainly, and sent means the chain shows it", () => {
  const tag = { plan: "ps", piece: 1, of: 2, to: AGENT, window: "day" as const, topUp: { day: T0, everyDays: 7 } };
  const base = { ...vaultNote("state-1", 5n * U), cashOutPlan: tag };
  const mark = { job: "j", at: T0 + DAY_MS, to: AGENT };
  const cases: [Partial<LocalNote>, string][] = [
    [{ cashOut: { ...mark, state: "scheduled" } }, "upcoming"],
    [{ cashOut: { ...mark, state: "sent" } }, "going"],
    [{ cashOut: { ...mark, state: "sent" }, status: "recovered" }, "sent"],
    [{ cashOut: { ...mark, state: "scheduled" }, status: "recovered" }, "sent"],
    [{ cashOut: { ...mark, state: "failed" } }, "returned"],
    [{ cashOut: { ...mark, state: "expired" } }, "returned"],
    [{ cashOut: { ...mark, state: "cancelled" } }, "cancelled"],
    [{ sweepPending: true }, "landing"],
    [{}, "unscheduled"],
    [{ status: "recovered" }, "cancelled"],
    [{ cashOutPlan: { ...tag, topUp: { ...tag.topUp, ended: "cancelled" } } }, "cancelled"],
    [{ cashOutPlan: { ...tag, topUp: { ...tag.topUp, ended: "kept" } } }, "cancelled"],
    [{ cashOutPlan: { ...tag, topUp: { ...tag.topUp, ended: "returned" } } }, "returned"],
  ];
  for (const [over, want] of cases) assert.equal(topUpState({ ...base, ...over }), want, JSON.stringify(over));
  assert.equal(topUpWhen({ state: "upcoming", at: T0 - 1 }, T0), "Going out now");
  assert.match(topUpWhen({ state: "upcoming", at: T0 + DAY_MS }, T0), /^[A-Z][a-z]{2} \d+, about /);
});

await test("the copy says what shows, and promises nothing the chain can't keep", () => {
  const mainnet = getNetwork("robinhood-mainnet");
  assert.match(agentGasLine(mainnet)!, /its own ETH for gas on Robinhood Chain/);
  assert.match(agentGasLine(mainnet)!, /stablecoins only/);
  assert.match(agentGasLine(mainnet)!, /ETH isn't held in the vault there/);
  assert.match(agentGasLine(getNetwork("base-mainnet"))!, /its own ETH for gas on Base/);
  assert.doesNotMatch(agentGasLine(getNetwork("base-mainnet"))!, /isn't held/, "ETH is a vault asset on Base");
  assert.equal(agentGasLine(getNetwork("tempo-mainnet")), null, "gas on Tempo is paid in stablecoins");
  const lines = [
    agentGasLine(mainnet)!,
    agentGasLine(getNetwork("base-mainnet"))!,
    ...(["upcoming", "going", "landing", "unscheduled", "sent", "returned", "cancelled"] as const).map((state) => topUpWhen({ state, at: T0 }, T0 + 1)),
  ];
  for (const l of lines) {
    assert.doesNotMatch(l, /—/);
    assert.doesNotMatch(l, /anonymous|untraceable/i);
  }
});

console.log(`\n${passed} passed`);
