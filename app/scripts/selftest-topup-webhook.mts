/**
 * Self-test: a top-up's webhook (lib/relay/webhook, webhookUrl, scheduled
 * takeNotices).
 *
 * The URL: https, a public host name, nothing that reaches inside a network. The
 * guard, ported from mcp/src/safeFetch: every spelling of a private address, and
 * a real connection to a name that resolves to one is refused before it opens. A
 * real TLS server takes a delivery: only { status, series, at } goes over the
 * wire, a redirect is not followed, and a host that hangs is given up on. Then
 * retries, and which jobs tell the webhook what, once each. Above all a notice
 * can't change a job: a dead webhook leaves it exactly as the run left it. The
 * cron's own route end to end, and the relay's checks on what it is handed.
 *
 * The test certificate is made at run time with openssl, in SELFTEST_TMP or the
 * system temp folder, and removed before any test runs.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-topup-webhook.mts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./browser-shim.mjs";
import { toFunctionSelector, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
process.env.GLOAM_RELAYER_PRIVATE_KEY = generatePrivateKey();
process.env.GLOAM_RELAY_JOB_KEY = "42".repeat(32);
process.env.CRON_SECRET = "selftest-cron";

const { webhookUrlProblem } = await import("../src/lib/relay/webhookUrl");
const { deliverNotices, guardedLookup, isPrivateAddress, postOnce } = await import("../src/lib/relay/webhook");
const { DAY_MS, GAS_RECHECK_MS, dayOf, memoryJobStore, runDueJobs, takeNotices } = await import("../src/lib/relay/scheduled");
const { scheduledStore } = await import("../src/lib/relay/scheduledStore");
const { getActiveNetwork } = await import("../src/lib/networks");
const route = await import("../src/app/api/relay/scheduled/route");
const cron = await import("../src/app/api/relay/scheduled/run/route");
type CashOutJob = import("../src/lib/relay/scheduled").CashOutJob;
type JobNotice = import("../src/lib/relay/webhook").JobNotice;

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const T0 = 1_800_000_000_000;
const HOOK = "https://hooks.example.com/owner/9f3a";
const hex32 = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const TO = "0x1111111111111111111111111111111111111111" as Address;
const ASSET = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address;

// ---------------------------------------------------------------- the URL

await test("a webhook is an https URL on a public host name, and nothing else", () => {
  for (const ok of [HOOK, "https://a.b.example.org/x?token=1", "https://example.com", "https://example.com:443/x"]) {
    assert.equal(webhookUrlProblem(ok), null, ok);
  }
  const bad: [unknown, RegExp][] = [
    ["http://example.com/x", /https/],
    ["ftp://example.com", /https/],
    ["file:///etc/passwd", /https/],
    ["example.com/x", /full https/],
    ["", /https/],
    [undefined, /https/],
    [42, /https/],
    [`https://example.com/${"x".repeat(520)}`, /https/],
    ["https://user:pass@example.com/", /name and password/],
    ["https://user@example.com/", /name and password/],
    ["https://example.com:8443/", /standard https port/],
    ["https://127.0.0.1/", /host name/],
    ["https://2130706433/", /host name/],
    ["https://0x7f.0.0.1/", /host name/],
    ["https://017700000001/", /host name/],
    ["https://169.254.169.254/latest/meta-data", /host name/],
    ["https://[::1]/", /host name/],
    ["https://[::ffff:127.0.0.1]/", /host name/],
    ["https://localhost/", /public host/],
    ["https://foo.localhost/", /public host/],
    ["https://printer.local/", /public host/],
    ["https://metadata.google.internal/", /public host/],
    ["https://intranet/", /public host/],
  ];
  for (const [url, why] of bad) assert.match(webhookUrlProblem(url) ?? "", why, String(url));
});

await test("the guard knows every spelling of a private address", () => {
  const priv = [
    "127.0.0.1", "127.8.8.8", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.0.1", "0.0.0.0", "192.0.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::ffff:0:127.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1",
    "64:ff9b::7f00:1", "64:ff9b:1::1", "2002:7f00:1::", "2002:c0a8:101::", "2001:0::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1",
    "not an address", "", "1.2.3", "::gggg",
  ];
  for (const ip of priv) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["1.1.1.1", "8.8.8.8", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

await test("a name that resolves to a private address is refused by the connection's own lookup", async () => {
  const seen = await new Promise<{ err: Error | null }>((resolve) => guardedLookup("localhost", {}, (err) => resolve({ err })));
  assert.match(seen.err?.message ?? "", /private address/);
  // and a real request never opens
  await assert.rejects(postOnce("https://localhost:1/x", "{}"), /private address/);
});

// ---------------------------------------------------------------- a real TLS server

const dir = mkdtempSync(join(process.env.SELFTEST_TMP ?? tmpdir(), "gloam-webhook-"));
const hits: { url: string; method: string; headers: Record<string, unknown>; body: string }[] = [];
let tls: { server: Server; port: number; ca: Buffer } | null = null;
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=hooks.example.com", "-addext", "subjectAltName=DNS:hooks.example.com"], { stdio: "ignore" });
  const ca = readFileSync(join(dir, "c.pem"));
  const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: ca }, (req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      hits.push({ url: req.url ?? "", method: req.method ?? "", headers: req.headers, body });
      if (req.url === "/hang") return;
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/second" });
        return res.end();
      }
      res.writeHead(req.url === "/boom" ? 500 : 204);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  tls = { server, port: (server.address() as { port: number }).port, ca };
} catch {
  console.log("--  no openssl here: the live TLS checks are skipped");
}
rmSync(dir, { recursive: true, force: true });

/** Connects to the local server under the certificate's name: the only thing the test changes is where the name resolves. */
const toLocal = (h: string, o: { all?: boolean }, cb: (e: null, a: never, f?: number) => void) =>
  (o.all ? cb(null, [{ address: "127.0.0.1", family: 4 }] as never) : cb(null, "127.0.0.1" as never, 4));
const live = () => ({ lookup: toLocal as never, ca: tls!.ca });
const at = (path: string) => `https://hooks.example.com:${tls!.port}${path}`;
const liveNotice = (over: object = {}) => ({ url: HOOK, body: { status: "failed" as const, series: "series-7f2c", at: "2026-11-01T00:00:00.000Z", ...over } });

if (tls) {
  await test("over real TLS the host gets a POST of status, series and at, and nothing else, whatever a notice carries", async () => {
    hits.length = 0;
    const smuggled = { ...liveNotice(), body: { ...liveNotice().body, amount: "50000000", to: TO, proof: "0xabc" } } as unknown as JobNotice;
    const out = await deliverNotices([smuggled], (u, b) => postOnce(u.replace("hooks.example.com", `hooks.example.com:${tls!.port}`), b, live()));
    assert.deepEqual(out, { delivered: 1, dropped: 0 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.method, "POST");
    assert.equal(hits[0]!.url, "/owner/9f3a");
    assert.deepEqual(JSON.parse(hits[0]!.body), { status: "failed", series: "series-7f2c", at: "2026-11-01T00:00:00.000Z" });
    assert.equal(hits[0]!.headers["content-type"], "application/json");
    assert.equal(hits[0]!.headers.authorization, undefined);
    assert.equal(hits[0]!.headers.cookie, undefined);
  });

  await test("a redirect is not followed, and a certificate that doesn't match is refused", async () => {
    hits.length = 0;
    assert.equal(await postOnce(at("/redirect"), "{}", live()), 302);
    assert.deepEqual(hits.map((h) => h.url), ["/redirect"], "the hop was never made");
    await assert.rejects(postOnce(`https://other.example.com:${tls!.port}/x`, "{}", live()), /certificate|altname|does not match/i);
    await assert.rejects(postOnce(at("/x"), "{}", { lookup: toLocal as never }), /self.signed|certificate/i, "and an unknown one");
  });

  await test("a host that takes the connection and never answers is given up on", async () => {
    const started = Date.now();
    await assert.rejects(postOnce(at("/hang"), "{}", live()));
    const took = Date.now() - started;
    assert.ok(took >= 2_500 && took < 4_500, `${took}ms`);
  });
}

// ---------------------------------------------------------------- retries

const noWait = async () => {};
const notice = (url = HOOK): JobNotice => ({ url, body: { status: "held", series: "s", at: "t" } });
function scripted(...answers: (number | "throw")[]) {
  const calls: string[] = [];
  const post = async (url: string, body: string) => {
    calls.push(body);
    const a = answers.shift() ?? 200;
    if (a === "throw") throw new Error("reset");
    return a;
  };
  return { post, calls };
}

await test("a few tries for a failure that can pass, and none for one that can't", async () => {
  const cases: [(number | "throw")[], number, boolean][] = [
    [[200], 1, true],
    [[204], 1, true],
    [[500, 200], 2, true],
    [["throw", 503, 200], 3, true],
    [[429, 200], 2, true],
    [[500, 500, 500], 3, false],
    [["throw", "throw", "throw"], 3, false],
    [[404], 1, false],
    [[401], 1, false],
    [[302], 1, false],
  ];
  for (const [answers, tries, ok] of cases) {
    const s = scripted(...answers);
    const out = await deliverNotices([notice()], s.post, noWait);
    assert.equal(s.calls.length, tries, JSON.stringify(answers));
    assert.deepEqual(out, ok ? { delivered: 1, dropped: 0 } : { delivered: 0, dropped: 1 }, JSON.stringify(answers));
  }
});

await test("delivery re-checks the URL, never throws, and one dead host doesn't cost another its notice", async () => {
  const s = scripted();
  assert.deepEqual(await deliverNotices([notice("http://example.com/x")], s.post, noWait), { delivered: 0, dropped: 1 });
  assert.equal(s.calls.length, 0, "a URL that isn't allowed is not called, however it got here");
  const post = async (url: string) => {
    if (url.includes("dead")) throw new Error("reset");
    return 200;
  };
  assert.deepEqual(await deliverNotices([notice("https://dead.example.com/"), notice("https://live.example.com/")], post, noWait), { delivered: 1, dropped: 1 });
  assert.deepEqual(await deliverNotices([], post, noWait), { delivered: 0, dropped: 0 });
});

// ---------------------------------------------------------------- what tells the webhook what

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
    to: TO,
    amount: "5000000",
    createdAt: T0 - 60_000,
    sendAfter: T0 - 1,
    status: "scheduled",
    attempts: 0,
    updatedAt: T0 - 60_000,
    dated: true,
    webhook: { url: HOOK, series: "series-7f2c" },
    ...over,
  };
}
class SendError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function world(fail: string | null = null, chain: { spent?: boolean; knownRoot?: boolean } = {}) {
  let clock = T0;
  return {
    set now(t: number) {
      clock = t;
    },
    deps: {
      now: () => clock,
      readChain: async () => ({ spent: chain.spent ?? false, knownRoot: chain.knownRoot ?? true }),
      send: async () => {
        if (fail) throw new SendError(fail);
        return hex32(9);
      },
    },
    clock: () => clock,
  };
}
const AT = new Date(T0).toISOString();

await test("a top-up that fails or expires says so once, with only status, series and at, and then forgets the address", async () => {
  for (const [w, status] of [[world("screened"), "failed"], [world(null, { knownRoot: false }), "expired"]] as const) {
    const j = job();
    const store = memoryJobStore();
    await store.put(j);
    const results = await runDueJobs(store, w.deps);
    assert.equal(results[0]!.status, status);
    const out = await takeNotices(store, results, T0);
    assert.deepEqual(out, [{ url: HOOK, body: { status, series: "series-7f2c", at: AT } }]);
    const after = (await store.get(j.id))!;
    assert.equal(after.webhook, undefined, "the address goes with the job's last notice");
    assert.equal(after.notified, status);
    assert.deepEqual(await takeNotices(store, results, T0), [], "and it is said once");
  }
});

await test("a top-up that can't go out on time is held, once, however many passes, and a later failure still says so", async () => {
  const j = job();
  const store = memoryJobStore();
  await store.put(j);
  const w = world("busy");
  let results = await runDueJobs(store, w.deps);
  assert.equal(results[0]!.status, "scheduled");
  assert.deepEqual((await takeNotices(store, results, T0)).map((n) => n.body.status), ["held"]);
  assert.ok((await store.get(j.id))!.webhook, "still kept: more may come");
  w.now = T0 + GAS_RECHECK_MS + 1;
  results = await runDueJobs(store, w.deps);
  assert.equal(results[0]!.status, "scheduled");
  assert.deepEqual(await takeNotices(store, results, w.clock()), [], "held is said once");
  w.now = j.sendAfter + DAY_MS + 1;
  results = await runDueJobs(store, w.deps);
  assert.equal(results[0]!.status, "failed");
  assert.deepEqual((await takeNotices(store, results, w.clock())).map((n) => n.body.status), ["failed"]);
});

await test("held for gas counts as held", async () => {
  const j = job();
  const store = memoryJobStore();
  await store.put(j);
  const w = world();
  const results = await runDueJobs(store, { ...w.deps, gasHigh: async () => true });
  assert.deepEqual((await takeNotices(store, results, T0)).map((n) => n.body.status), ["held"]);
});

await test("a top-up that went out, was cancelled or has no webhook says nothing, and one that went out drops the address", async () => {
  const sent = job();
  const none = job({ webhook: undefined });
  const late = job({ sendAfter: T0 + 60_000 });
  const store = memoryJobStore();
  for (const j of [sent, none, late]) await store.put(j);
  const results = await runDueJobs(store, world().deps);
  assert.deepEqual(await takeNotices(store, results, T0), []);
  assert.equal((await store.get(sent.id))!.status, "sent");
  assert.equal((await store.get(sent.id))!.webhook, undefined, "it has no more use for the address");
  const silent = job({ webhook: undefined });
  const s2 = memoryJobStore();
  await s2.put(silent);
  assert.deepEqual(await takeNotices(s2, await runDueJobs(s2, world("screened").deps), T0), []);
});

await test("a dead webhook changes nothing: the job ends as the run left it, and goes out when it can", async () => {
  const j = job();
  const store = memoryJobStore();
  await store.put(j);
  const w = world("busy");
  const results = await runDueJobs(store, w.deps);
  const before = (await store.get(j.id))!;
  const out = await takeNotices(store, results, T0);
  assert.deepEqual(await deliverNotices(out, async () => Promise.reject(new Error("dead")), noWait), { delivered: 0, dropped: 1 });
  const after = (await store.get(j.id))!;
  assert.deepEqual({ ...after, notified: undefined }, { ...before, notified: undefined }, "only that it was told");
  // and a store that fails while marking it costs a notice, never the run
  const flaky = { ...store, put: async () => Promise.reject(new Error("redis down")) };
  assert.deepEqual(await takeNotices(flaky, [{ id: j.id, status: "failed" }], T0), []);
  const held = { ...store, lock: async () => null };
  assert.deepEqual(await takeNotices(held, [{ id: j.id, status: "failed" }], T0), [], "a job another run holds is left to it");
  const good = world();
  good.now = j.sendAfter + 10 * 60_000;
  assert.deepEqual((await runDueJobs(store, good.deps)).map((r) => r.status), ["sent"]);
});

// ---------------------------------------------------------------- the relay's side

const net = getActiveNetwork();
const RPC = net.chain.rpcUrls.default.http[0];
const SEL = { spent: toFunctionSelector("spent(bytes32)"), isKnownRoot: toFunctionSelector("isKnownRoot(bytes32)") };
const word = (b: boolean) => "0x" + (b ? "1" : "0").padStart(64, "0");
const Z32 = "0x" + "00".repeat(32);
const BLOCK = { number: "0x7", hash: "0x" + "12".repeat(32), parentHash: Z32, nonce: "0x0000000000000000", sha3Uncles: Z32, logsBloom: "0x" + "00".repeat(256), transactionsRoot: Z32, stateRoot: Z32, receiptsRoot: Z32, miner: "0x" + "00".repeat(20), difficulty: "0x0", totalDifficulty: "0x0", extraData: "0x", size: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", timestamp: "0x1", baseFeePerGas: "0x1", transactions: [], uncles: [] };
let nodeDown = false;
function answer(r: { method: string; params?: unknown[] }): object {
  switch (r.method) {
    case "eth_chainId":
      return { result: toHex(net.chainId) };
    case "eth_blockNumber":
      return { result: "0x7" };
    case "eth_getBlockByNumber":
      return { result: BLOCK };
    case "eth_getTransactionCount":
      return { result: "0x0" };
    case "eth_getBalance":
      return { result: toHex(10n ** 18n) };
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return { result: "0x1" };
    case "eth_estimateGas":
      return { result: "0x1b7740" };
    case "eth_call": {
      const sel = String((r.params?.[0] as { data?: string }).data).slice(0, 10);
      return sel === SEL.spent ? { result: word(false) } : sel === SEL.isKnownRoot ? { result: word(true) } : { error: { code: -32000, message: "unknown" } };
    }
    default:
      return { error: { code: -32601, message: r.method } };
  }
}
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.replace(/\/$/, "") !== RPC.replace(/\/$/, "")) throw new Error(`selftest: no network (${url})`);
  if (nodeDown) throw new TypeError("fetch failed");
  const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
  const list = Array.isArray(body) ? body : [body];
  const out = list.map((r) => ({ jsonrpc: "2.0", id: r.id, ...answer(r) }));
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const PROOF = ("0x" + "22".repeat(256)) as Hex;
let nfSeq = 0x6000;
const post = async (over: object) => {
  const r = await route.POST(
    new Request("http://localhost/api/relay/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.6.0.1" },
      body: JSON.stringify({ chainId: net.chainId, proof: PROOF, root: hex32(0x77), nullifier: hex32(++nfSeq), asset: ASSET, to: TO, amount: "5000000", ...over }),
    })
  );
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
};
const tomorrow = () => dayOf(Date.now()) + DAY_MS;
const webhook = { url: HOOK, series: "2f1c6e0a-1111-4000-8000-000000000001" };

await test("the relay keeps a webhook with a dated job, sealed, and never says it back", async () => {
  const r = await post({ day: tomorrow(), webhook });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.webhook, undefined, "not in the answer");
  const saved = (await scheduledStore().get(String(r.json.id)))!;
  assert.deepEqual(saved.webhook, webhook);
  const read = await route.GET(new Request(`http://localhost/api/relay/scheduled?id=${String(r.json.id)}`, { headers: { "x-forwarded-for": "10.6.0.1" } }));
  assert.ok(!JSON.stringify(await read.json()).includes("hooks.example.com"), "nor in a read");
});

await test("the relay refuses a webhook on anything but a dated job, or one it wouldn't call", async () => {
  assert.equal((await post({ window: "6h", webhook })).status, 400, "only a top-up has one");
  for (const bad of [{ ...webhook, url: "http://example.com/x" }, { ...webhook, url: "https://127.0.0.1/x" }, { ...webhook, url: "https://metadata.google.internal/" }, { ...webhook, series: "../../etc" }, { ...webhook, series: "" }, { url: HOOK }, "https://example.com", null]) {
    const r = await post({ day: tomorrow(), webhook: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await post({ day: tomorrow() })).status, 200, "it stays optional");
});

await test("end to end, the cron's own route: a job held by a dead network tells a dead webhook, and nothing else changes", async () => {
  const store = scheduledStore();
  const j = job({ id: "00000000-0000-4000-8000-0000000c0de1", chainId: net.chainId, sendAfter: Date.now() - 1, updatedAt: Date.now(), webhook: { url: "https://hooks.example.invalid/x", series: "series-e2e" } });
  await store.create(j);
  nodeDown = true;
  const logs: string[] = [];
  const info = console.info;
  console.info = (...a: unknown[]) => logs.push(a.join(" "));
  try {
    const res = await cron.GET(new Request("http://localhost/api/relay/scheduled/run", { headers: { authorization: "Bearer selftest-cron" } }));
    assert.equal(res.status, 200);
    assert.ok(((await res.json()) as { ok: boolean }).ok);
  } finally {
    console.info = info;
    nodeDown = false;
  }
  const after = (await store.get(j.id))!;
  assert.deepEqual([after.status, after.attempts, after.proof, after.notified], ["scheduled", 0, j.proof, "held"]);
  assert.ok(after.webhook, "kept: it may still fail");
  assert.ok(logs.some((l) => l.includes("gloam_cashout_later_notices") && l.includes('"dropped":1')), "counted");
  assert.ok(!logs.join(" ").includes("hooks.example"), "the logs never hold the address");
});

tls?.server.closeAllConnections();
tls?.server.close();
console.log(`\n${passed} passed`);
process.exit(0);
