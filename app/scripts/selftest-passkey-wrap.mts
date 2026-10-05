/**
 * Self-test: passkey key wrapping (lib/passkeyWrap.ts) with a fake PRF output.
 * WebCrypto only; no browser, no passkey.
 *
 * Run from app/:  npx tsx scripts/selftest-passkey-wrap.mts
 */
import assert from "node:assert/strict";
import {
  b64,
  b64url,
  newWrappableDataKey,
  parseWrapRecord,
  randomBytes,
  unb64,
  unb64url,
  unwrapDataKey,
  wrapDataKey,
  type PasskeyWrapRecord,
} from "../src/lib/passkeyWrap";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const prf = randomBytes(32); // stands in for the passkey's PRF output
const credentialId = b64url(randomBytes(32));

async function seal(key: CryptoKey, text: string) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv, ct };
}
async function open(key: CryptoKey, box: { iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv }, key, box.ct));
}

const dataKey = await newWrappableDataKey();
const record: PasskeyWrapRecord = {
  v: 1,
  credentialId,
  rpId: "localhost",
  prfSalt: b64(randomBytes(32)),
  ...(await wrapDataKey(dataKey, prf, credentialId)),
  createdAt: Date.now(),
};

await test("wrap/unwrap round trip opens data sealed under the original key", async () => {
  const box = await seal(dataKey, "note secrets");
  const unwrapped = await unwrapDataKey(record, prf);
  assert.equal(await open(unwrapped, box), "note secrets");
  // And the other way round.
  const box2 = await seal(unwrapped, "payroll links");
  assert.equal(await open(dataKey, box2), "payroll links");
});

await test("unwrapped key is non-extractable", async () => {
  const unwrapped = await unwrapDataKey(record, prf);
  assert.equal(unwrapped.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("raw", unwrapped));
});

await test("wrong PRF output is refused", async () => {
  const other = randomBytes(32);
  await assert.rejects(unwrapDataKey(record, other));
  const flipped = new Uint8Array(prf);
  flipped[0] ^= 1;
  await assert.rejects(unwrapDataKey(record, flipped));
});

await test("record is bound to its credential id", async () => {
  await assert.rejects(unwrapDataKey({ ...record, credentialId: b64url(randomBytes(32)) }, prf));
});

await test("tampered record is refused", async () => {
  const w = unb64(record.wrapped);
  w[3] ^= 0xff;
  await assert.rejects(unwrapDataKey({ ...record, wrapped: b64(w) }, prf));
  await assert.rejects(unwrapDataKey({ ...record, kdfSalt: b64(randomBytes(32)) }, prf));
  await assert.rejects(unwrapDataKey({ ...record, iv: b64(randomBytes(12)) }, prf));
});

await test("short PRF output is refused", async () => {
  await assert.rejects(wrapDataKey(dataKey, randomBytes(16), credentialId));
});

await test("each wrap uses fresh salt and IV", async () => {
  const again = await wrapDataKey(dataKey, prf, credentialId);
  assert.notEqual(again.kdfSalt, record.kdfSalt);
  assert.notEqual(again.iv, record.iv);
  assert.notEqual(again.wrapped, record.wrapped);
});

await test("record parse round trip and rejects junk", () => {
  assert.deepEqual(parseWrapRecord(JSON.stringify(record)), record);
  assert.equal(parseWrapRecord(null), null);
  assert.equal(parseWrapRecord("{"), null);
  assert.equal(parseWrapRecord(JSON.stringify({ ...record, v: 2 })), null);
  assert.equal(parseWrapRecord(JSON.stringify({ ...record, wrapped: 7 })), null);
});

await test("base64url round trip", () => {
  for (let n = 0; n < 40; n++) {
    const b = randomBytes(n);
    assert.deepEqual(unb64url(b64url(b)), b);
    assert.doesNotMatch(b64url(b), /[+/=]/);
  }
});

console.log(`\npasskey wrap: ${passed} passed`);
