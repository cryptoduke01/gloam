/**
 * Self-test: what /api/recovery lets in (app/api/recovery/route.ts).
 *
 * Security review, 25 Oct 2026: backups never expire (a lapsed one can cost
 * someone their funds), so the store must not be fillable. One connection
 * could file 50 new backups of up to 512 KB a day, forever. Now:
 *   - saving to a backup that already exists is always let through and never
 *     counts against anything daily;
 *   - a new backup counts against its connection (5 a day, an IPv6 /64 as one)
 *     and against one daily budget for every new backup
 *     (GLOAM_RECOVERY_NEW_PER_DAY, 2,000 by default); past it, new backups are
 *     told to try again later, and the server logs it once;
 *   - a request that is not a valid backup is refused before it counts.
 *
 * Uses the in-process store (GLOAM_PARTNERS_STORE=memory) and the real route.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-recovery-route.mts
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const stub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? stub : resolve.call(this, req, ...rest);
};

const { PUT, GET } = await import("../src/app/api/recovery/route");
const { resetMemoryKv } = await import("../src/lib/partnersKv");

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  resetMemoryKv();
  // a fresh day for the counters
  (globalThis as { __gloamMcpRate?: Map<string, unknown> }).__gloamMcpRate?.clear();
  delete process.env.GLOAM_RECOVERY_NEW_PER_DAY;
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

let k = 0;
const hex64 = () => (++k).toString(16).padStart(64, "0");
const WRITE = "b".repeat(64);
const BLOB = Buffer.from("sealed backup").toString("base64");

async function put(ip: string, id: string, n = 1, c = BLOB) {
  const res = await PUT(
    new Request("http://localhost/api/recovery", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ id, write: WRITE, c, n }),
    })
  );
  const json = (await res.json()) as { ok: boolean; error?: { message: string } };
  return { status: res.status, message: json.error?.message ?? "" };
}

await test("a new backup: 5 a day per connection, an IPv6 /64 as one; saving to one that exists always goes through", async () => {
  const ids = Array.from({ length: 5 }, hex64);
  for (const id of ids) assert.equal((await put("203.0.113.10", id)).status, 200);
  const sixth = await put("203.0.113.10", hex64());
  assert.equal(sixth.status, 429, "the sixth new backup from one connection waits for tomorrow");
  // saving to a backup that exists is never counted
  for (let n = 2; n <= 40; n++) assert.equal((await put("203.0.113.10", ids[0]!, n)).status, 200, `update ${n}`);
  // another connection still makes its own
  assert.equal((await put("198.51.100.20", hex64())).status, 200);
  // one /64 is one connection
  for (let i = 1; i <= 5; i++) assert.equal((await put(`2001:db8:7:9::${i}`, hex64())).status, 200);
  assert.equal((await put("2001:db8:7:9:ffff::1", hex64())).status, 429);
});

await test("the daily budget for new backups: past it, new ones are told to try again later and it is logged once; existing ones keep saving", async () => {
  process.env.GLOAM_RECOVERY_NEW_PER_DAY = "3";
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    const mine = hex64();
    assert.equal((await put("192.0.2.1", mine)).status, 200);
    assert.equal((await put("192.0.2.2", hex64())).status, 200);
    assert.equal((await put("192.0.2.3", hex64())).status, 200);
    for (const ip of ["192.0.2.4", "192.0.2.5", "192.0.2.6"]) {
      const r = await put(ip, hex64());
      assert.equal(r.status, 429, ip);
      assert.match(r.message, /try again later/i);
    }
    assert.equal(logged.filter((l) => l.includes("gloam_recovery_new_budget_full")).length, 1, "logged once");
    // someone with a backup is never affected
    assert.equal((await put("192.0.2.4", mine, 2)).status, 200);
    const read = await GET(new Request(`http://localhost/api/recovery?id=${mine}`, { headers: { "x-forwarded-for": "192.0.2.9" } }));
    assert.equal(read.status, 200);
  } finally {
    console.warn = warn;
  }
});

await test("a request that is not a valid backup is refused before it counts", async () => {
  for (const bad of ["not base64!", "", "A".repeat(600_000)]) {
    const r = await put("203.0.113.50", hex64(), 1, bad);
    assert.ok(r.status === 400 || r.status === 413, `refused: ${r.status}`);
  }
  const zero = await PUT(
    new Request("http://localhost/api/recovery", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
      body: JSON.stringify({ id: hex64(), write: WRITE, c: BLOB, n: 0 }),
    })
  );
  assert.equal(zero.status, 400);
  // the connection still has all five of its new backups
  for (let i = 0; i < 5; i++) assert.equal((await put("203.0.113.50", hex64())).status, 200);
});

await test("a full-size backup still fits", async () => {
  const big = "A".repeat(511_996) + "AA==";
  assert.equal((await put("203.0.113.60", hex64(), 1, big)).status, 200);
  assert.equal((await put("203.0.113.60", hex64(), 1, big + "AAAA")).status, 400);
});

console.log(`\nrecovery route: ${passed} passed`);
