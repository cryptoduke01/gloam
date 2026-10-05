/**
 * Self-test: sanctions screening (matcher, vendored list, /api/screen, relay).
 * Nothing is sent anywhere: the relay rejects before any RPC call or signing.
 *
 * Run from app/:  npx tsx scripts/selftest-screening.mts
 */
import assert from "node:assert/strict";
import { getAddress } from "viem";
import snapshot from "../src/lib/screeningList.json";
import {
  SCREEN_BLOCKED_MESSAGE,
  anySanctioned,
  isSanctioned,
  loadSanctionsList,
  normalizeAddress,
} from "../src/lib/screening";
import { screenAddresses } from "../src/lib/screeningServer";
import { POST as screenPost } from "../src/app/api/screen/route";
import { POST as relayPost } from "../src/app/api/relay/route";
import { screenCall } from "../src/lib/relay/server";
import { NETWORK_KEYS, getNetwork, isNetworkWritable } from "../src/lib/networks";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

// Lazarus Group (Ronin bridge exploit), on the OFAC SDN list since 2022-04-14.
const LISTED = "0x098b716b8aaf21512996dc57eb0615e2383e2f96";
const CLEAN = "0x1111111111111111111111111111111111111111";

await test("vendored list loads and is well formed", () => {
  const set = loadSanctionsList(snapshot);
  assert.equal(set.size, snapshot.count);
  assert.ok(set.size >= 100, "list looks too short");
  for (const a of snapshot.addresses) assert.match(a, /^0x[0-9a-f]{40}$/);
  assert.match(snapshot.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(snapshot.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(snapshot.source.includes("0xB10C/ofac-sanctioned-digital-currency-addresses"));
});

await test("malformed lists are refused", () => {
  assert.throws(() => loadSanctionsList(null));
  assert.throws(() => loadSanctionsList({ addresses: [] }));
  assert.throws(() => loadSanctionsList({ addresses: ["not-an-address"] }));
  assert.throws(() => loadSanctionsList({ addresses: [LISTED], count: 2 }));
});

await test("match is case-insensitive", () => {
  assert.ok(isSanctioned(LISTED));
  assert.ok(isSanctioned("0x" + LISTED.slice(2).toUpperCase()));
  assert.ok(isSanctioned(`  ${LISTED}  `));
});

await test("EIP-55 checksummed form matches", () => {
  const checksummed = getAddress(LISTED);
  assert.notEqual(checksummed, LISTED);
  assert.ok(isSanctioned(checksummed));
  // Every entry, in checksum form, is found.
  for (const a of snapshot.addresses) assert.ok(isSanctioned(getAddress(a)), a);
});

await test("clean and invalid inputs are not matched", () => {
  assert.equal(isSanctioned(CLEAN), false);
  assert.equal(isSanctioned(""), false);
  assert.equal(isSanctioned("0x1234"), false);
  assert.equal(isSanctioned(LISTED + "00"), false);
  assert.equal(normalizeAddress(42), null);
  assert.equal(anySanctioned([CLEAN, undefined, "gloamr1abc"]), false);
  assert.equal(anySanctioned([CLEAN, getAddress(LISTED)]), true);
});

await test("custom list is honoured", () => {
  const list = loadSanctionsList({ addresses: [CLEAN] });
  assert.ok(isSanctioned(getAddress(CLEAN), list));
  assert.equal(isSanctioned(LISTED, list), false);
});

await test("server screen (no Chainalysis key in this run)", async () => {
  assert.deepEqual(await screenAddresses([getAddress(LISTED)]), { allowed: false });
  assert.deepEqual(await screenAddresses([CLEAN]), { allowed: true });
  assert.deepEqual(await screenAddresses([CLEAN, LISTED]), { allowed: false });
});

function req(url: string, body: unknown, ip = "203.0.113.7") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

await test("/api/screen: blocked answer is neutral", async () => {
  const res = await screenPost(req("http://localhost/api/screen", { addresses: [getAddress(LISTED)] }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, { ok: true, allowed: false, message: SCREEN_BLOCKED_MESSAGE });
  assert.equal(JSON.stringify(json).toLowerCase().includes(LISTED), false);
});

await test("/api/screen: clean and invalid", async () => {
  const ok = await screenPost(req("http://localhost/api/screen", { addresses: [CLEAN] }));
  assert.deepEqual(await ok.json(), { ok: true, allowed: true });
  const bad = await screenPost(req("http://localhost/api/screen", { addresses: ["nope"] }));
  assert.equal(bad.status, 400);
  const many = await screenPost(req("http://localhost/api/screen", { addresses: Array(5).fill(CLEAN) }));
  assert.equal(many.status, 400);
});

const net = NETWORK_KEYS.map(getNetwork).find((n) => isNetworkWritable(n) && n.pool);
assert.ok(net, "no relay network configured");
const H32 = "0x" + "11".repeat(32);
const PROOF = "0x" + "22".repeat(256);

await test("relay helper refuses a sanctioned cash-out recipient", async () => {
  await assert.rejects(
    screenCall({ kind: "unshield", args: [PROOF, H32, H32, CLEAN, getAddress(LISTED), 1n] } as never),
    (e: Error & { code?: string; status?: number }) =>
      e.message === SCREEN_BLOCKED_MESSAGE && e.code === "screened" && e.status === 403
  );
  await screenCall({ kind: "unshield", args: [PROOF, H32, H32, CLEAN, CLEAN, 1n] } as never);
  await screenCall({ kind: "transfer", args: [PROOF, H32, H32, [H32, H32]] } as never);
});

await test("relay route rejects before any RPC call or signing", async () => {
  const res = await relayPost(
    req("http://localhost/api/relay", {
      chainId: net.chainId,
      action: "unshield",
      proof: PROOF,
      root: H32,
      nullifier: H32,
      asset: "0x0000000000000000000000000000000000000000",
      to: getAddress(LISTED),
      amount: "1",
    })
  );
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false, error: SCREEN_BLOCKED_MESSAGE, code: "screened" });
});

console.log(`\nscreening: ${passed} passed`);
