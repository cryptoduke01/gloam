/**
 * Self-test: saved payroll schedules are never dropped to make room, a refused
 * write changes nothing (and the next one still works), and two tabs saving at
 * once both keep their change.
 *
 * Review, 24 Oct 2026: every write cut the list to 50, across all networks, so
 * saving a 51st schedule silently deleted the oldest one. A delete that failed
 * still vanished from the page (it was back on the next visit), and two tabs
 * writing at once could each overwrite the other's change.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-payroll-schedules.mts
 */
import assert from "node:assert/strict";
import { localStorage, resetBrowser } from "./browser-shim.mjs";
import type { Address } from "viem";

const sched = await import("../src/lib/payrollSchedule");
const { MAX_SCHEDULES, deleteSchedule, loadSchedules, markSchedulePaid, newSchedule, saveSchedule } = sched;
type PayrollSchedule = import("../src/lib/payrollSchedule").PayrollSchedule;

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  resetBrowser();
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const POOL = "0x00000000000000000000000000000000000000aa" as Address;
const ASSET = "0x00000000000000000000000000000000000000ee" as Address;
const RH = 4663;
const TEMPO = 4217;
const base = newSchedule({ name: "Team", chainId: RH, pool: POOL, asset: ASSET, cadence: { kind: "monthly", day: 1 }, cap: 100n, people: [] });
const make = (id: string, chainId = RH): PayrollSchedule => ({ ...base, id, chainId });
const everywhere = async () => [...(await loadSchedules(RH, POOL)), ...(await loadSchedules(TEMPO, POOL))];
const ids = async () => (await everywhere()).map((s) => s.id).sort();

/** Run `fn` as a browser without Web Locks (each write re-reads before it lands). */
async function withoutLocks(fn: () => Promise<void>) {
  const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
  try {
    await fn();
  } finally {
    if (real) Object.defineProperty(globalThis, "navigator", real);
  }
}

/** localStorage refusing writes to one key, as a full one would. */
async function storageFull(fn: () => Promise<void>) {
  const set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => {
    if (k === "gloam.payroll.schedules.v1") throw new Error("QuotaExceededError");
    set(k, v);
  };
  try {
    await fn();
  } finally {
    localStorage.setItem = set;
  }
}

await test(`a new schedule past ${MAX_SCHEDULES} is refused, and none is dropped for it`, async () => {
  for (let i = 0; i < MAX_SCHEDULES; i++) await saveSchedule(make(`s${i}`, i % 2 ? TEMPO : RH));
  const before = await ids();
  assert.equal(before.length, MAX_SCHEDULES);
  await assert.rejects(saveSchedule(make("one-more")), /keeps up to 50 schedules/);
  assert.deepEqual(await ids(), before, "the oldest schedule (s0) is still there, on both networks");
});

await test("at the limit, an edit still saves and a delete makes room", async () => {
  for (let i = 0; i < MAX_SCHEDULES; i++) await saveSchedule(make(`s${i}`));
  await saveSchedule({ ...make("s0"), name: "Renamed" });
  const all = await everywhere();
  assert.equal(all.length, MAX_SCHEDULES);
  assert.equal(all.find((s) => s.id === "s0")?.name, "Renamed");
  await deleteSchedule("s1");
  await saveSchedule(make("fresh"));
  assert.equal((await everywhere()).length, MAX_SCHEDULES);
  assert.ok((await ids()).includes("fresh"));
});

await test("a write the browser refuses changes nothing, and the next write works", async () => {
  await saveSchedule(make("keep"));
  const stored = localStorage.getItem("gloam.payroll.schedules.v1");
  await storageFull(async () => {
    await assert.rejects(deleteSchedule("keep"), /QuotaExceeded/);
    await assert.rejects(saveSchedule(make("refused")), /QuotaExceeded/);
    await assert.rejects(markSchedulePaid("keep", "2026-10-01", "b1"), /QuotaExceeded/);
  });
  assert.equal(localStorage.getItem("gloam.payroll.schedules.v1"), stored);
  assert.deepEqual(await ids(), ["keep"], "the refused delete did not delete");
  await saveSchedule(make("after"));
  assert.deepEqual(await ids(), ["after", "keep"], "the queue is not stuck on the failure");
});

for (const locks of [true, false]) {
  const how = locks ? "with Web Locks" : "without Web Locks (re-read before write)";
  await test(`two tabs saving at once keep both, ${how}`, async () => {
    const go = async () => {
      const other = (await import(`../src/lib/payrollSchedule.ts?tab=${locks}`)) as typeof sched;
      assert.notEqual(other.saveSchedule, saveSchedule, "a second tab has its own write queue");
      await saveSchedule(make("paid-one"));
      await Promise.all([saveSchedule(make("a")), other.saveSchedule(make("b"))]);
      await Promise.all([markSchedulePaid("paid-one", "2026-10-01", "run-1"), other.saveSchedule(make("c"))]);
      await Promise.all([deleteSchedule("a"), other.saveSchedule(make("d"))]);
      assert.deepEqual(await ids(), ["b", "c", "d", "paid-one"]);
      assert.equal((await everywhere()).find((s) => s.id === "paid-one")?.paidThrough, "2026-10-01");
    };
    if (locks) await go();
    else await withoutLocks(go);
  });
}

console.log(`\n${passed} payroll schedule checks passed`);
