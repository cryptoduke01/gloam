/**
 * The Payment scheme codec: spec test vectors, round trips of challenges,
 * credentials and receipts, header parsing edge cases, and byte compatibility
 * with mppx in both directions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Challenge, Credential, Receipt } from "mppx";
import {
  canonicalJson,
  computeChallengeId,
  createPaymentChallenge,
  encodeJsonParam,
  extractPaymentCredential,
  formatPaymentChallenge,
  parseAuthenticate,
  parseCredential,
  parsePaymentChallenges,
  parseReceipt,
  serializeCredential,
  serializeReceipt,
  verifyChallengeId,
  credentialField,
  isExpired,
  MalformedCredentialError,
} from "../src/core.js";

test("challenge ids match the core spec's HMAC-SHA256 test vectors", async () => {
  const requestB64 = encodeJsonParam({ amount: "1000000" });
  assert.equal(requestB64, "eyJhbW91bnQiOiIxMDAwMDAwIn0");
  const base = { realm: "api.example.com", method: "tempo", intent: "charge", requestB64 };
  const secret = "test-vector-secret";
  assert.equal(await computeChallengeId(base, secret), "X6v1eo7fJ76gAxqY0xN9Jd__4lUyDDYmriryOM-5FO4");
  assert.equal(
    await computeChallengeId({ ...base, header: "Payment-Authorization" }, secret),
    "S91xi-OFGZPMs-j7GsX0FDpIkmCcZT1P9XyV58WNy_U"
  );
  const opaque = encodeJsonParam({ pi: "pi_123" });
  assert.equal(opaque, "eyJwaSI6InBpXzEyMyJ9");
  assert.equal(
    await computeChallengeId({ ...base, header: "Payment-Authorization", opaque }, secret),
    "CJ4X1O4aTDmS59hfdhnhBtxIQjWDOf0bcrhsswwMOW8"
  );
});

test("canonical JSON sorts keys, drops undefined, and refuses what JSON cannot carry", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, "x"], c: null }, z: undefined }), '{"a":{"c":null,"d":[1,"x"]},"b":1}');
  assert.equal(canonicalJson({ "é": 1, e: 2, E: 3 }), '{"E":3,"e":2,"é":1}');
  assert.throws(() => canonicalJson({ n: 1n }), /bigint/);
  assert.throws(() => canonicalJson({ n: Number.NaN }), /non-finite/);
});

test("a challenge survives format -> parse unchanged, and its id verifies", async () => {
  const ch = await createPaymentChallenge({
    secretKey: "k".repeat(32),
    realm: "api.example.com",
    method: "gloam",
    intent: "charge",
    request: { amount: "250000", currency: "0x20c0000000000000000000000000000000000000", recipient: "gloamr1.x", methodDetails: { chainId: 42431 } },
    expires: "2030-01-01T00:00:00Z",
    description: 'A "quoted" \\ description',
    opaque: { order: "o-1" },
  });
  const header = formatPaymentChallenge(ch);
  const [back] = parsePaymentChallenges(header);
  assert.deepEqual(back, ch);
  assert.equal(await verifyChallengeId(back!, "k".repeat(32)), true);
  assert.equal(await verifyChallengeId(back!, "j".repeat(32)), false, "another server's key does not verify it");
  const tampered = { ...back!, requestB64: encodeJsonParam({ ...back!.request, amount: "1" }) };
  assert.equal(await verifyChallengeId(tampered, "k".repeat(32)), false, "a changed request breaks the id");
  assert.equal(credentialField(ch), "Authorization");
  const alt = await createPaymentChallenge({ secretKey: "k".repeat(32), realm: "r", method: "gloam", intent: "charge", request: {}, paymentAuthorizationHeader: true });
  assert.equal(credentialField(alt), "Payment-Authorization");
});

test("WWW-Authenticate with several schemes, joined fields, token68 and escapes", async () => {
  const a = await createPaymentChallenge({ secretKey: "s".repeat(32), realm: "a.example", method: "gloam", intent: "charge", request: { amount: "1" } });
  const b = await createPaymentChallenge({ secretKey: "s".repeat(32), realm: "a.example", method: "tempo", intent: "charge", request: { amount: "2" } });
  const joined = `Bearer realm="x", error="invalid_token", ${formatPaymentChallenge(a)}, Basic Zm9vOmJhcg==, ${formatPaymentChallenge(b)}, Negotiate`;
  const all = parseAuthenticate(joined);
  assert.deepEqual(all.map((c) => c.scheme), ["Bearer", "Payment", "Basic", "Payment", "Negotiate"]);
  assert.equal(all[0]!.params.error, "invalid_token");
  assert.equal(all[2]!.token68, "Zm9vOmJhcg==");
  const pays = parsePaymentChallenges(joined);
  assert.deepEqual(pays.map((p) => p.method), ["gloam", "tempo"]);
  assert.equal(pays[0]!.request.amount, "1");
  // Malformed Payment challenges are skipped, not fatal.
  const broken = `Payment id="", realm="r", method="gloam", intent="charge", request="e30", Payment id="x", realm="r", method="GLOAM", intent="charge", request="e30", Payment id="y", realm="r", method="gloam", intent="charge", request="!!!", ${formatPaymentChallenge(a)}`;
  assert.deepEqual(parsePaymentChallenges(broken).map((p) => p.id), [a.id]);
  // Unquoted token values and odd spacing.
  const [loose] = parseAuthenticate(`Payment   id = abc ,realm=r,method=gloam , intent=charge, request=e30`);
  assert.deepEqual(loose!.params, { id: "abc", realm: "r", method: "gloam", intent: "charge", request: "e30" });
});

test("credentials round trip and echo the challenge byte for byte", async () => {
  const ch = await createPaymentChallenge({
    secretKey: "s".repeat(32),
    realm: "api.example.com",
    method: "gloam",
    intent: "charge",
    request: { z: 1, a: "b" },
    expires: "2030-01-01T00:00:00Z",
    paymentAuthorizationHeader: true,
  });
  const value = serializeCredential({ challenge: ch, payload: { type: "hash", hash: "0xab" }, source: "did:example:1" });
  assert.match(value, /^Payment [A-Za-z0-9_-]+$/);
  const back = parseCredential(value);
  assert.deepEqual(back.challenge, ch);
  assert.equal(back.challenge.requestB64, ch.requestB64);
  assert.deepEqual(back.payload, { type: "hash", hash: "0xab" });
  assert.equal(back.source, "did:example:1");
  assert.equal(await verifyChallengeId(back.challenge, "s".repeat(32)), true);

  assert.equal(extractPaymentCredential(`Bearer abc, ${value}`), value);
  assert.equal(extractPaymentCredential("Bearer abc"), null);
  for (const bad of ["Bearer x", "Payment !!", "Payment e30", `Payment ${Buffer.from('{"challenge":{"id":"x"}}').toString("base64url")}`]) {
    assert.throws(() => parseCredential(bad), MalformedCredentialError, bad);
  }
});

test("receipts round trip; expiry is fail closed", () => {
  const r = { status: "success" as const, method: "gloam", timestamp: "2026-10-06T00:00:00Z", reference: "0x01", challengeId: "c", chainId: 42431 };
  assert.deepEqual(parseReceipt(serializeReceipt(r)), r);
  assert.throws(() => parseReceipt(serializeReceipt({ ...r, status: "failed" } as never)));
  assert.equal(isExpired({ expires: "2000-01-01T00:00:00Z" }), true);
  assert.equal(isExpired({ expires: "not a date" }), true, "an unreadable expiry counts as expired");
  assert.equal(isExpired({}), false);
});

test("byte compatible with mppx: challenges, credentials and receipts cross both ways", async () => {
  const secretKey = "mppx-interop-secret-key-at-least-32b";
  const request = { amount: "1000", currency: "0x20c0000000000000000000000000000000000000", recipient: "gloamr1.abc", methodDetails: { chainId: 42431, pool: "0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb" } };

  // mppx mints, we parse and verify.
  const theirs = Challenge.from({ realm: "api.example.com", method: "gloam", intent: "charge", request, expires: "2030-01-01T00:00:00Z", secretKey });
  const [parsed] = parsePaymentChallenges(Challenge.serialize(theirs));
  assert.equal(parsed!.id, theirs.id);
  assert.deepEqual(parsed!.request, request);
  assert.equal(await verifyChallengeId(parsed!, secretKey), true, "our HMAC matches mppx's");

  // We mint, mppx parses and verifies.
  const ours = await createPaymentChallenge({ secretKey, realm: "api.example.com", method: "gloam", intent: "charge", request, expires: "2030-01-01T00:00:00Z", opaque: { k: "v" } });
  const read = Challenge.deserialize(formatPaymentChallenge(ours));
  assert.equal(read.id, ours.id);
  assert.equal(Challenge.verify(read, { secretKey }), true, "mppx accepts our challenge id");

  // Credentials: ours -> mppx, mppx -> ours.
  const payload = { type: "hash", hash: `0x${"11".repeat(32)}`, ticket: "gloam2t.x", binding: "b" };
  const mine = serializeCredential({ challenge: ours, payload });
  const viaMppx = Credential.deserialize(mine);
  assert.equal(viaMppx.challenge.id, ours.id);
  assert.deepEqual(viaMppx.payload, payload);
  assert.equal(Challenge.verify(viaMppx.challenge, { secretKey }), true);
  const fromMppx = parseCredential(Credential.serialize(Credential.from({ challenge: theirs, payload })));
  assert.equal(await verifyChallengeId(fromMppx.challenge, secretKey), true);
  assert.deepEqual(fromMppx.payload, payload);

  // Receipts.
  const receipt = { status: "success" as const, method: "gloam", timestamp: "2026-10-06T12:00:00Z", reference: `0x${"22".repeat(32)}`, challengeId: ours.id, chainId: 42431 };
  assert.deepEqual(Receipt.deserialize(serializeReceipt(receipt)), receipt);
  assert.deepEqual(parseReceipt(Receipt.serialize(Receipt.from(receipt))), receipt);
});
