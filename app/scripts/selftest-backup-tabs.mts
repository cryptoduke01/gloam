/**
 * Self-test: the backup card reads the note store as it is now, not this tab's
 * old copy of it (user report, 24 Oct 2026).
 *
 * Settings has no notes hook: it never re-reads the store when another tab
 * writes it, and its copy stays empty until the vault is unlocked (by the
 * cash-out refresh, about 8 seconds after the page opens). So:
 *   - a backup copied in a Settings tab left open while a claim was secured in
 *     another tab held the claimed note and not the note it was secured into;
 *   - a restore in a Settings tab opened moments before took every note as new,
 *     and once the unlock merged this tab's copy over the store, the claim lost
 *     its secured mark.
 * Each "tab" is its own copy of lib/noteVault over one shared localStorage and
 * IndexedDB. The Settings tab is the copy lib/shield uses.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-backup-tabs.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import type { Address, Hex } from "viem";

type Vault = typeof import("../src/lib/noteVault");
type LocalNote = import("../src/lib/shield").LocalNote;

const { getActiveNetwork } = await import("../src/lib/networks");
// the Settings tab: lib/shield and this copy of the store, nothing unlocked yet
const shield = await import("../src/lib/shield");
const settings = (await import("../src/lib/noteVault")) as Vault;

let tabs = 0;
/** Another tab of the app (Pay, where the claim is made and secured). */
async function openTab(): Promise<Vault> {
  const v = (await import(`../src/lib/noteVault.ts?tab=${++tabs}`)) as Vault;
  await v.unlockNoteVault();
  return v;
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const net = getActiveNetwork();
const ME = "0x1111111111111111111111111111111111111111" as Address;
const ASSET = "0x00000000000000000000000000000000000000ee" as Address;
const hex = (fill: string) => `0x${fill.repeat(64).slice(0, 64)}` as Hex;

let n = 0;
function note(id: string, extra: Partial<LocalNote> = {}): LocalNote {
  n++;
  return {
    id,
    chainId: net.chainId,
    pool: net.pool as Address,
    asset: ASSET,
    amountWei: "10000000",
    commitment: hex(`${n}c`),
    secret: hex(`${n}a`),
    nullifier: hex(`${n}b`),
    bound: true,
    scheme: "poseidon",
    from: ME,
    createdAt: Date.now() + n,
    status: "open",
    source: "local",
    ...extra,
  };
}

/** A claim secured in the Pay tab: the claimed note retired, the swept note counted. */
async function claimAndSecure(pay: Vault, id: string) {
  const claim = note(`imp-${id}`);
  await pay.setAllNotes([claim, ...pay.getAllNotes()]);
  const swept = note(`swp-${id}`, { sweptFrom: { id: claim.id, nullifier: claim.nullifier! }, leafIndex: 7 });
  return { claim, swept, landed: () => pay.setAllNotes([swept, ...pay.getAllNotes().map((m) => (m.id === claim.id ? { ...m, status: "recovered" as const, secured: true } : m))]) };
}

await test("a restore in a Settings tab opened moments ago keeps a secured claim secured", async () => {
  const pay = await openTab();
  const { claim, swept, landed } = await claimAndSecure(pay, "1");
  const backup = JSON.stringify({ v: 1, type: "gloam-notes-backup", exportedAt: Date.now(), chainId: net.chainId, notes: [claim] });
  await landed();
  // Settings was just opened: its copy of the store is still empty
  assert.equal(settings.getAllNotes().length, 0);
  const res = await shield.importNotesBackup(backup, ME, async (m) => m.id === claim.id);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.kept, 1, "the claim is already in this browser");
  assert.equal(res.count + res.moved, 0, "nothing new to add");
  await pay.syncFromDisk();
  const stored = pay.getAllNotes().find((m) => m.id === claim.id)!;
  assert.equal(stored.secured, true, "Prove still shows it secured");
  assert.equal(stored.status, "recovered");
  assert.ok(pay.getAllNotes().some((m) => m.id === swept.id && m.status === "open"), "the swept note is untouched");
});

await test("a backup copied in a Settings tab left open holds the note a claim was secured into, not the spent claim", async () => {
  const pay = await openTab();
  const { claim, swept, landed } = await claimAndSecure(pay, "2");
  // Settings reads the store once, here, right after the claim; then another tab secures it
  await settings.unlockNoteVault();
  await settings.syncFromDisk();
  assert.ok(settings.getAllNotes().some((m) => m.id === claim.id && m.status === "open"));
  await landed();

  const ids = (await shield.exportNotesBackup(ME)).notes.map((m) => m.id);
  assert.ok(ids.includes(swept.id), "the swept note is in the backup");
  assert.ok(!ids.includes(claim.id), "the spent claim is not");
});

await new Promise((r) => setTimeout(r, 50));
console.log(`\nbackup tabs: ${passed} passed`);
