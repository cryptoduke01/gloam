/**
 * Self-test: the recovery backup after a page load (lib/recovery), against a
 * stand-in /api/recovery.
 *
 * A page with no notes hook (Settings) holds no notes until the vault is
 * unlocked, about 8 seconds after it opens, and a page that saves notes may
 * be one where the backup never started. So:
 *  - a save in that window must hold what the store holds, not an empty list
 *    that replaces the backup
 *  - a restore in that window must not take a note for new and write the
 *    backup's older copy over the store's
 *  - a note saved where no backup was running, or on a page that closed before
 *    the save, goes up on the next page load, and a page load with nothing new
 *    saves nothing
 *
 * Each "tab" is its own copy of lib/noteVault or lib/recovery over one shared
 * localStorage and IndexedDB. Nothing leaves the process.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-recovery-fresh-load.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import type { Address, Hex } from "viem";

type LocalNote = import("../src/lib/shield").LocalNote;
type Vault = typeof import("../src/lib/noteVault");
type Recovery = typeof import("../src/lib/recovery");

const win = globalThis.window as unknown as Record<string, unknown>;
win.setTimeout = setTimeout;
win.clearTimeout = clearTimeout;

const backups = new Map<string, { c: string; n: number; t: number }>();
let puts = 0;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (method === "GET") {
    const id = new URL(String(url), "https://gloam.trade").searchParams.get("id")!;
    const b = backups.get(id);
    return b ? Response.json({ data: b }) : Response.json({ error: { message: "none" } }, { status: 404 });
  }
  const body = JSON.parse(String(init!.body)) as { id: string; c?: string; n?: number };
  if (method === "PUT") {
    puts++;
    const t = Date.now();
    backups.set(body.id, { c: body.c!, n: body.n!, t });
    return Response.json({ data: { n: body.n, t } });
  }
  throw new Error(`unexpected ${method}`);
}) as typeof fetch;

const ME = "0x1111111111111111111111111111111111111111" as Address;
const ASSET = "0x00000000000000000000000000000000000000ee" as Address;
const hex = (fill: string) => `0x${fill.repeat(64).slice(0, 64)}` as Hex;
let n = 0;
function note(id: string, extra: Partial<LocalNote> = {}): LocalNote {
  n++;
  return {
    id,
    chainId: 46630,
    pool: "0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740" as Address,
    asset: ASSET,
    amountWei: "10000000",
    commitment: hex(`${n}c`),
    secret: hex(`${n}a`),
    nullifier: hex(`${n}b`),
    bound: true,
    scheme: "poseidon",
    from: ME,
    createdAt: 1_000 + n,
    status: "open",
    source: "local",
    ...extra,
  };
}

let tabs = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A page that holds its own copy of the store, opened and read. */
async function openVault(): Promise<Vault> {
  const v = (await import(`../src/lib/noteVault.ts?tab=${++tabs}`)) as Vault;
  await v.unlockNoteVault();
  return v;
}
/** The backup a fresh page load runs, sharing the page's note store. */
const openRecovery = async () => (await import(`../src/lib/recovery.ts?load=${++tabs}`)) as Recovery;

async function backedUp(keys: { id: string; key: string }): Promise<LocalNote[]> {
  const raw = Uint8Array.from(atob(backups.get(keys.id)!.c), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(keys.key), (ch) => ch.charCodeAt(0)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(keys.id) },
    key,
    raw.slice(12),
  );
  return (JSON.parse(new TextDecoder().decode(plain)) as { notes: LocalNote[] }).notes;
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

// The page under test: this copy of the store has read nothing, like Settings just after it opens.
const settings = (await import("../src/lib/noteVault")) as Vault;
const recovery = (await import("../src/lib/recovery")) as Recovery;
const keys = await recovery.keysFromSecret("passkey", new Uint8Array(32).fill(7));
const other = await openVault();
const mine = note("n-held");
await other.setAllNotes([mine]);

await test("a save just after a page load holds the store's notes, not an empty list", async () => {
  assert.equal(settings.getAllNotes().length, 0, "this page has read nothing yet");
  await recovery.connectRecovery(keys, ME);
  assert.deepEqual((await backedUp(keys)).map((x) => x.id), ["n-held"]);
});

await test("a note saved where no backup ran goes up on the next page load", async () => {
  const before = puts;
  await other.setAllNotes([note("n-while-away"), ...other.getAllNotes()]);
  (await openRecovery()).startRecoverySync();
  for (let i = 0; i < 400 && puts === before; i++) await sleep(10);
  assert.equal(puts, before + 1, "one save");
  assert.deepEqual((await backedUp(keys)).map((x) => x.id).sort(), ["n-held", "n-while-away"]);
});

await test("a page load with nothing new saves nothing", async () => {
  const before = puts;
  (await openRecovery()).startRecoverySync();
  await sleep(3_500);
  assert.equal(puts, before);
});

await test("a restore just after a page load keeps the store's newer copy of a note", async () => {
  const fresh = (await import(`../src/lib/noteVault.ts?tab=${++tabs}`)) as Vault;
  const spent = note("n-spent", { status: "recovered" });
  await other.setAllNotes([spent, ...other.getAllNotes()]);
  // A backup from before it was closed here, on another device's keys, read by a page that has read nothing.
  const elsewhere = await recovery.keysFromSecret("passkey", new Uint8Array(32).fill(9));
  const blob = await (async () => {
    const iv = new Uint8Array(12);
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(elsewhere.key), (ch) => ch.charCodeAt(0)), "AES-GCM", false, ["encrypt"]);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(elsewhere.id) },
        key,
        new TextEncoder().encode(JSON.stringify({ v: 1, savedAt: 1, notes: [{ ...spent, status: "open" }], receive: { current: null, previous: [] } })),
      ),
    );
    const out = new Uint8Array(12 + ct.length);
    out.set(ct, 12);
    return btoa(String.fromCharCode(...out));
  })();
  backups.set(elsewhere.id, { c: blob, n: 1, t: Date.now() });
  await recovery.connectRecovery(elsewhere, ME, { save: false });
  await fresh.unlockNoteVault();
  await fresh.syncFromDisk();
  assert.equal(fresh.getAllNotes().find((x) => x.id === "n-spent")?.status, "recovered");
});

console.log(`selftest-recovery-fresh-load: ${passed} passed`);
process.exit(0);
