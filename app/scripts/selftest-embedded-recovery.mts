/**
 * Self-test: the private-balance backup for a Gloam wallet (lib/embeddedRecovery
 * over lib/recovery), with a deterministic signer standing in for Turnkey.
 *
 * Recovery's wallet key comes from a signature of a fixed message, so it needs a
 * wallet that signs the same bytes the same way every time. A Turnkey key is a
 * secp256k1 key like any other, and @turnkey/viem hands back a 65-byte signature;
 * whether Turnkey's signer picks the same nonce each time (RFC 6979) can only be
 * seen on a live organization (DEPLOY-TURNKEY.md, test 4). Here:
 *  - after sign-in, recovery turns on by itself with two signatures, compared,
 *    and the backup on the server holds the notes
 *  - the signatures go through the Gloam wallet's own provider (personal_sign),
 *    the way wagmi reaches it, and give the same key as signing directly
 *  - a new device: an empty browser, the same sign-in, and the notes come back
 *  - a run happens once per wallet per page, however often the signer is rebuilt
 *  - a signer that signs differently each time (the same key, a different but
 *    valid signature) is caught: nothing is saved, recovery stays off, and the
 *    result says to use a passkey
 *  - a browser that already backs up (a passkey, say) is left as it is
 *  - recovery turned off by the person stays off
 *
 * Uses the real /api/recovery route and store in-process, the app's browser
 * shim, and throwaway local keys. Nothing leaves the process.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-embedded-recovery.mts
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { hexToBigInt, keccak256, numberToHex, toHex, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { resetBrowser } from "./browser-shim.mjs";
import type { LocalNote } from "../src/lib/shield";

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const stub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? stub : resolve.call(this, req, ...rest);
};

const win = globalThis.window as unknown as Record<string, unknown> & { dispatchEvent: (e: unknown) => boolean };
win.setTimeout = setTimeout;
win.clearTimeout = clearTimeout;

const route = await import("../src/app/api/recovery/route");
const { readBackup } = await import("../src/lib/recoveryStore");
const { resetMemoryKv } = await import("../src/lib/partnersKv");

const puts: string[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const full = new URL(String(url), "https://www.gloam.trade");
  const body = init?.body ? String(init.body) : undefined;
  if (method === "PUT") puts.push((JSON.parse(body!) as { id: string }).id);
  const req = new Request(full, { method, body, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" } });
  return route[method as "GET" | "PUT" | "DELETE"](req);
}) as typeof fetch;

const recovery = await import("../src/lib/recovery");
const vault = await import("../src/lib/noteVault");
const { syncEmbeddedRecovery, resetEmbeddedRecovery, embeddedRecoveryResult } = await import("../src/lib/embeddedRecovery");
const { makeEmbeddedProvider } = await import("../src/lib/embeddedProvider");
const { robinhood } = await import("../src/lib/chain");
const { custom } = await import("viem");

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

/** Stands in for the Turnkey account: a real secp256k1 key whose signatures are deterministic (RFC 6979). */
const GLOAM_WALLET = privateKeyToAccount(`0x${"7a".repeat(32)}`);
const OTHER_WALLET = privateKeyToAccount(`0x${"7b".repeat(32)}`);
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * The wallet as recovery sees it after a sign-in: messages signed through the
 * Gloam wallet's provider, as personal_sign, with each prompt written down.
 */
function signedInWallet(account: PrivateKeyAccount, { unsteady = false } = {}) {
  const provider = makeEmbeddedProvider({
    chains: [robinhood],
    transportFor: () => custom({ request: async () => null }),
    signer: () => ({ account }),
  });
  const prompts: string[] = [];
  let n = 0;
  return {
    address: account.address as string,
    prompts,
    sign: async (message: string): Promise<Hex> => {
      prompts.push(message);
      const sig = (await provider.request({ method: "personal_sign", params: [toHex(message), account.address] })) as Hex;
      if (!unsteady || n++ % 2 === 0) return sig;
      // Same key, same message, a different valid signature: (r, n - s) with the other parity.
      const r = sig.slice(2, 66);
      const s = hexToBigInt(`0x${sig.slice(66, 130)}`);
      const v = parseInt(sig.slice(130, 132), 16);
      return `0x${r}${numberToHex(SECP256K1_N - s, { size: 32 }).slice(2)}${(v === 27 ? 28 : 27).toString(16)}` as Hex;
    },
  };
}

const note = (name: string) =>
  ({
    id: `note-${name}`,
    chainId: 4663,
    pool: "0x39e28cde55cab798874746ac52cb4b5cc99a0194",
    asset: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    amountWei: "1000000",
    commitment: keccak256(toHex(`commitment ${name}`)),
    secret: keccak256(toHex(`secret ${name}`)),
    nullifier: keccak256(toHex(`nullifier ${name}`)),
    bound: true,
    scheme: "poseidon",
    createdAt: 1,
    status: "open",
    source: "local",
  }) as unknown as LocalNote;

const ids = () => vault.getAllNotes().map((x) => x.id).sort();

/** Another device: the same server, a browser with nothing in it, a new page. */
async function newDevice() {
  await recovery.turnOffRecovery({ deleteBackup: false });
  await vault.setAllNotes([]);
  resetBrowser();
  resetEmbeddedRecovery();
  win.dispatchEvent({ type: "storage", key: "gloam.recovery.v1" });
  await new Promise((r) => setTimeout(r, 20));
  puts.length = 0;
}

async function freshWorld() {
  await newDevice();
  resetMemoryKv();
  (globalThis as { __gloamMcpRate?: Map<string, unknown> }).__gloamMcpRate?.clear();
}

const keysOf = async (account: PrivateKeyAccount) =>
  recovery.keysFromSecret("wallet", recovery.walletSecret(await account.signMessage({ message: recovery.recoveryMessageV2(account.address) }))!);

await test("signing through the Gloam wallet's provider gives the same recovery key as signing directly", async () => {
  const w = signedInWallet(GLOAM_WALLET);
  const message = recovery.recoveryMessageV2(GLOAM_WALLET.address);
  const viaProvider = recovery.walletSecret(await w.sign(message));
  const direct = recovery.walletSecret(await GLOAM_WALLET.signMessage({ message }));
  assert.ok(viaProvider && direct);
  assert.equal(toHex(viaProvider), toHex(direct));
});

await test("after sign-in, recovery turns on by itself: two signatures, compared, and the notes are backed up", async () => {
  await freshWorld();
  await vault.setAllNotes([note("a"), note("b")]);
  const w = signedInWallet(GLOAM_WALLET);
  const result = await syncEmbeddedRecovery(w);
  assert.deepEqual(result, { kind: "on", restored: 0 });
  assert.equal(w.prompts.length, 2, "version 2 signed twice");
  assert.ok(w.prompts.every((p) => p === recovery.recoveryMessageV2(GLOAM_WALLET.address)), "only the recovery message");
  const state = recovery.recoveryState();
  assert.ok(state.on && state.newerKey && state.source === "wallet");
  const keys = await keysOf(GLOAM_WALLET);
  assert.ok(await readBackup(keys.id), "the backup is on the server, under the wallet's key");
  assert.deepEqual(embeddedRecoveryResult()?.result, { kind: "on", restored: 0 });
});

await test("once per wallet per page: a rebuilt signer asks nothing again", async () => {
  const w = signedInWallet(GLOAM_WALLET);
  assert.deepEqual(await syncEmbeddedRecovery(w), { kind: "on", restored: 0 });
  assert.equal(w.prompts.length, 0);
});

await test("a new device: the same sign-in brings the notes back", async () => {
  await newDevice();
  assert.deepEqual(ids(), [], "an empty browser");
  assert.equal(recovery.recoveryState().on, false);
  const w = signedInWallet(GLOAM_WALLET);
  const result = await syncEmbeddedRecovery(w);
  assert.deepEqual(result, { kind: "on", restored: 2 });
  assert.deepEqual(ids(), ["note-a", "note-b"]);
  const back = vault.getAllNotes().find((x) => x.id === "note-a")!;
  assert.equal(back.secret, note("a").secret, "the note's secret came back whole");
  assert.ok(recovery.recoveryState().on, "and this device backs up from now on");
});

await test("a note made on the new device joins the same backup", async () => {
  await vault.setAllNotes([note("c"), ...vault.getAllNotes()]);
  await recovery.backupNow();
  await newDevice();
  assert.deepEqual(await syncEmbeddedRecovery(signedInWallet(GLOAM_WALLET)), { kind: "on", restored: 3 });
  assert.deepEqual(ids(), ["note-a", "note-b", "note-c"]);
});

await test("a wallet that signs differently each time is caught: nothing saved, recovery off, use a passkey", async () => {
  await freshWorld();
  await vault.setAllNotes([note("d")]);
  const w = signedInWallet(OTHER_WALLET, { unsteady: true });
  // both signatures are valid for the same key: only their bytes differ
  const m = recovery.recoveryMessageV2(OTHER_WALLET.address);
  const [s1, s2] = [await w.sign(m), await w.sign(m)];
  assert.notEqual(s1, s2);
  w.prompts.length = 0;
  const result = await syncEmbeddedRecovery(w);
  assert.deepEqual(result, { kind: "unsupported" });
  assert.equal(recovery.recoveryState().on, false);
  assert.equal(puts.length, 0, "no backup was written");
});

await test("a browser that already backs up is left as it is", async () => {
  await freshWorld();
  const passkeyKeys = await recovery.keysFromSecret("passkey", new Uint8Array(32).fill(5));
  await recovery.connectRecovery(passkeyKeys, null);
  const w = signedInWallet(GLOAM_WALLET);
  assert.deepEqual(await syncEmbeddedRecovery(w), { kind: "already" });
  assert.equal(w.prompts.length, 0);
  assert.equal(recovery.recoveryState().source, "passkey");
});

await test("recovery the person turned off stays off; turning it on again lifts that", async () => {
  await freshWorld();
  await syncEmbeddedRecovery(signedInWallet(GLOAM_WALLET));
  await recovery.turnOffRecovery({ deleteBackup: true });
  assert.equal(recovery.recoveryTurnedOffHere(), true);
  resetEmbeddedRecovery();
  const w = signedInWallet(GLOAM_WALLET);
  assert.deepEqual(await syncEmbeddedRecovery(w), { kind: "declined" });
  assert.equal(w.prompts.length, 0);
  assert.equal(recovery.recoveryState().on, false);
  // the person turns it on in Settings: the mark goes
  await recovery.turnOnWithWallet(signedInWallet(GLOAM_WALLET));
  assert.equal(recovery.recoveryTurnedOffHere(), false);
});

console.log(`selftest-embedded-recovery: ${passed} passed`);
process.exit(0);
