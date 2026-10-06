/**
 * The gloam charge end to end against an in-memory pool: a payer turns a 402
 * challenge into a credential, the payee validates it and sweeps the payment
 * before issuing a receipt. Covers push and pull, replay, a credential lifted
 * onto another challenge, wrong keys, amounts, assets, pools and events, a
 * payer who spends the payment back, lost sweep receipts, and concurrency.
 */
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hex } from "viem";
import {
  buildGloamPayment,
  buildPrivateSendIntent,
  fieldToHex,
  generateReceiveKey,
  hexToField,
  noteNullifierPoseidon,
  type NoteExport,
} from "@gloamtrade/sdk";
import {
  buildGloamChargeRequest,
  challengeBinding,
  createGloamChargeCredential,
  createPaymentChallenge,
  memoryReplayStore,
  parseGloamChargePayload,
  parseGloamChargeRequest,
  settleGloamCharge,
  toPaymentRequirements,
  fromPaymentRequirements,
  transfersInReceipt,
  validateGloamCharge,
  payloadFromPayment,
  GloamChargeError,
  GLOAM_CHARGE_INTENT,
  GLOAM_METHOD,
  type GloamChargeServerConfig,
  type GloamMode,
  type PaymentChallenge,
} from "../src/core.js";
import { CHAIN_ID, POOL, USD, fundedNote, mockPool, stubProve, type MockPool } from "./helpers.js";

// Random per run: a fixed string here only trips secret scanners.
const SECRET = randomBytes(24).toString("hex");
const payee = await generateReceiveKey();
const stranger = await generateReceiveKey();

async function challengeFor(price: bigint, opts: { modes?: GloamMode[]; expires?: Date; realm?: string; recipient?: string } = {}) {
  const request = buildGloamChargeRequest({ amountWei: price, recipient: opts.recipient ?? payee.tag, network: "tempo", modes: opts.modes });
  return createPaymentChallenge({
    secretKey: SECRET,
    realm: opts.realm ?? "api.example.com",
    method: GLOAM_METHOD,
    intent: GLOAM_CHARGE_INTENT,
    request: request as unknown as Record<string, unknown>,
    expires: opts.expires ?? new Date(Date.now() + 600_000),
  });
}

function serverConfig(pool: MockPool, over: Partial<GloamChargeServerConfig> = {}): GloamChargeServerConfig & { stored: NoteExport[] } {
  const stored: NoteExport[] = [];
  return {
    receiveKey: payee,
    chain: pool.chain,
    prove: stubProve,
    submit: pool.submitter("payee"),
    replay: memoryReplayStore(),
    beforeSubmit: (fresh) => void stored.push(fresh),
    stored,
    ...over,
  };
}

async function pay(pool: MockPool, ch: PaymentChallenge, mode: GloamMode, noteAmount = 1000n) {
  const note = await fundedNote(pool, noteAmount);
  const kept: string[] = [];
  const created = await createGloamChargeCredential({
    challenge: ch,
    note,
    prove: stubProve,
    mode,
    submit: pool.submitter("payer"),
    waitForReceipt: pool.chain.waitForReceipt,
    beforeSubmit: (built) => void kept.push(built.changeNote.amountWei),
  });
  return { ...created, kept, note };
}

const settle = (ch: PaymentChallenge, payload: unknown, config: GloamChargeServerConfig) => settleGloamCharge({ challenge: ch, payload, config });

async function rejects(p: Promise<unknown>, pattern: RegExp, retryable = false) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof GloamChargeError, String(e));
    assert.match(e.message, pattern);
    assert.equal(e.retryable, retryable, `retryable for: ${e.message}`);
    return true;
  });
}

test("request and payload shapes: build, parse, refuse", async () => {
  const r = buildGloamChargeRequest({ amountWei: 250_000n, recipient: payee.tag, network: "tempo", description: "one answer", externalId: "o-1" });
  assert.deepEqual(r, {
    amount: "250000",
    currency: USD,
    recipient: payee.tag,
    description: "one answer",
    externalId: "o-1",
    methodDetails: { chainId: CHAIN_ID, pool: POOL, decimals: 6 },
  });
  assert.deepEqual(parseGloamChargeRequest(JSON.parse(JSON.stringify(r))), r);
  const pushOnly = buildGloamChargeRequest({ amountWei: 1n, recipient: payee.tag, modes: ["push"] });
  assert.deepEqual(pushOnly.methodDetails.supportedModes, ["push"]);
  assert.equal(buildGloamChargeRequest({ amountWei: 1n, recipient: payee.tag, modes: ["pull", "push"] }).methodDetails.supportedModes, undefined, "both modes is the default and stays implicit");
  assert.equal(buildGloamChargeRequest({ amountWei: 1n, recipient: payee.tag, network: "robinhood" }).methodDetails.decimals, 18);

  assert.throws(() => buildGloamChargeRequest({ amountWei: 1n, recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00" }), /receive tag/);
  assert.throws(() => buildGloamChargeRequest({ amountWei: 0n, recipient: payee.tag }), /positive/);
  assert.throws(() => buildGloamChargeRequest({ amountWei: 1n, recipient: payee.tag, network: 1 }), /no Gloam pool/);
  for (const [bad, why] of [
    [{ ...r, amount: "1.5" }, /amount/],
    [{ ...r, amount: "-1" }, /amount/],
    [{ ...r, currency: "usd" }, /currency/],
    [{ ...r, recipient: "acct_123" }, /receive tag/],
    [{ ...r, methodDetails: { ...r.methodDetails, chainId: "42431" } }, /chainId/],
    [{ ...r, methodDetails: { ...r.methodDetails, supportedModes: ["card"] } }, /supportedModes/],
    [{ ...r, methodDetails: { ...r.methodDetails, version: 2 } }, /version 2/],
  ] as const) {
    assert.throws(() => parseGloamChargeRequest(bad), (e: unknown) => e instanceof GloamChargeError && e.code === "bad-request" && why.test(e.message));
  }
  const h = `0x${"ab".repeat(32)}`;
  const binding = "A".repeat(43);
  assert.deepEqual(parseGloamChargePayload({ type: "hash", hash: h, ticket: "gloam2t.x", binding }), { type: "hash", hash: h, ticket: "gloam2t.x", binding });
  for (const bad of [
    { type: "hash", hash: "0x12", ticket: "gloam2t.x", binding },
    { type: "hash", hash: h, ticket: "gloam1.plain-note", binding },
    { type: "hash", hash: h, ticket: "gloam2t.x", binding: "short" },
    { type: "transfer", transfer: { proof: "0x", root: h, nullifier: h, newCommitments: [h, h] }, ticket: "gloam2t.x", binding },
    { type: "transfer", transfer: { proof: "0x00", root: h, nullifier: h, newCommitments: [h] }, ticket: "gloam2t.x", binding },
    { type: "card", ticket: "gloam2t.x", binding },
  ]) {
    assert.throws(() => parseGloamChargePayload(bad), (e: unknown) => e instanceof GloamChargeError && e.code === "invalid-payload");
  }

  // Bridges to and from the SDK's x402 requirements keep the terms.
  const req = toPaymentRequirements(r, "api.example.com");
  assert.equal(req.maxAmountRequired, "250000");
  assert.equal(req.payTo, payee.tag);
  assert.equal(req.poolAddress, POOL);
  const back = fromPaymentRequirements(req, { decimals: 6, externalId: "o-1" });
  assert.deepEqual(back, r);

  // The binding is a keyed hash of the challenge: it changes with the id, the realm and the note.
  const base = { secret: `0x${"07".repeat(31)}` as Hex, realm: "api.example.com", challengeId: "abc", commitment: `0x${"0c".repeat(32)}` as Hex };
  const b0 = await challengeBinding(base);
  assert.match(b0, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await challengeBinding({ ...base, commitment: base.commitment.toUpperCase().replace("0X", "0x") as Hex }), b0);
  assert.notEqual(await challengeBinding({ ...base, challengeId: "abd" }), b0);
  assert.notEqual(await challengeBinding({ ...base, realm: "evil.example" }), b0);
  assert.notEqual(await challengeBinding({ ...base, secret: `0x${"08".repeat(31)}` as Hex }), b0);
});

test("push: the payer broadcasts, the payee validates, sweeps, and only then issues a receipt", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const paid = await pay(pool, ch, "push");
  assert.equal(paid.mode, "push");
  assert.deepEqual(pool.submitted, ["payer"]);
  assert.deepEqual(paid.kept, ["600"], "the change note was handed over before anything was sent");
  assert.equal(paid.credential.payload.type, "hash");
  assert.match(paid.authorization, /^Payment [A-Za-z0-9_-]+$/);
  const wire = JSON.stringify(paid.credential.payload);
  assert.ok(!wire.includes(paid.built.paymentNote.secret.slice(2)), "the payment note secret is not in the credential");
  assert.ok(!wire.includes(paid.built.changeNote.secret.slice(2)), "the change secret is not in the credential");
  assert.ok(!wire.includes(paid.note.secret.slice(2)), "the funding note secret is not in the credential");

  const config = serverConfig(pool);
  const v = await validateGloamCharge({ challenge: ch, payload: paid.credential.payload, config });
  assert.equal(v.mode, "push");
  assert.equal(v.note.amountWei, "400");
  assert.equal(pool.submitted.length, 1, "validate is read-only: nothing submitted");

  const receipt = await settleGloamCharge({ challenge: ch, payload: paid.credential.payload, config, validated: v });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.method, "gloam");
  assert.equal(receipt.challengeId, ch.id);
  assert.equal(receipt.chainId, CHAIN_ID);
  assert.match(receipt.reference, /^0x[0-9a-f]{64}$/);
  assert.match(receipt.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(pool.submitted, ["payer", "payee"], "the payee swept");
  assert.equal(config.stored.length, 1, "the fresh note was handed over for storage before the sweep");
  assert.equal(config.stored[0]!.amountWei, "400");
  assert.notEqual(config.stored[0]!.secret, paid.built.paymentNote.secret, "the money sits under a secret the payer never saw");
  assert.ok(await pool.chain.isCommitmentSeen(config.stored[0]!.commitment));

  // The sweep's Transferred event spends the payment note.
  const sweep = transfersInReceipt((await pool.chain.getReceipt(receipt.reference))!, POOL)[0]!;
  assert.equal(sweep.newCommitments[0], config.stored[0]!.commitment.toLowerCase());

  // The payer cannot spend the payment back now.
  const back = await buildPrivateSendIntent({
    secretHex: paid.built.paymentNote.secret, amountInWei: 400n, amountPayWei: 400n, asset: USD,
    path: (await pool.chain.pathForCommitment(paid.built.paymentNote.commitment))!, prove: stubProve, poolAddress: POOL, chainId: CHAIN_ID,
  });
  assert.equal((await pool.chain.waitForReceipt(await pool.transfer(back.exec.args))).status, "reverted");

  // The same credential again: refused, at validate and at settle.
  await rejects(validateGloamCharge({ challenge: ch, payload: paid.credential.payload, config }), /already used/);
  await rejects(settle(ch, paid.credential.payload, config), /already used/);
  // A server with a fresh replay store still refuses: the nullifier is spent on chain.
  await rejects(settle(ch, paid.credential.payload, serverConfig(pool)), /already spent/);
});

test("pull: the server submits the payer's transfer, so the payer never touches the chain", async () => {
  const pool = mockPool();
  const ch = await challengeFor(250n);
  const paid = await pay(pool, ch, "pull");
  assert.equal(paid.mode, "pull");
  assert.equal(paid.hash, null);
  assert.deepEqual(pool.submitted, [], "nothing broadcast by the payer");
  assert.equal(paid.credential.payload.type, "transfer");

  const config = serverConfig(pool);
  const receipt = await settle(ch, paid.credential.payload, config);
  assert.equal(receipt.status, "success");
  assert.deepEqual(pool.submitted, ["payee", "payee"], "the payee submitted the payment, then the sweep");
  assert.equal(config.stored[0]!.amountWei, "250");
  await rejects(settle(ch, paid.credential.payload, config), /already used/);
});

test("auto mode prefers pull, falls back to push, and respects the challenge", async () => {
  const pool = mockPool();
  const note = await fundedNote(pool, 1000n);
  const base = { note, prove: stubProve, submit: pool.submitter("payer") };
  const auto = await createGloamChargeCredential({ ...base, challenge: await challengeFor(10n) });
  assert.equal(auto.mode, "pull");
  const pushOnly = await createGloamChargeCredential({ ...base, challenge: await challengeFor(10n, { modes: ["push"] }) });
  assert.equal(pushOnly.mode, "push");
  await assert.rejects(
    createGloamChargeCredential({ ...base, submit: undefined, challenge: await challengeFor(10n, { modes: ["push"] }) }),
    /no submitter/
  );
  await assert.rejects(createGloamChargeCredential({ ...base, mode: "pull", challenge: await challengeFor(10n, { modes: ["push"] }) }), /does not accept pull/);
});

test("the payer refuses bad terms before proving anything", async () => {
  const pool = mockPool();
  const note = await fundedNote(pool, 1000n);
  let proved = 0;
  const prove = async () => (proved++, { proofBytes: "0xdeadbeef" as Hex });
  const base = { note, prove, submit: pool.submitter("payer") };
  const ch = await challengeFor(500n);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: ch, policy: { maxAmountWei: 499n } }), /over the payer's limit/);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: ch, policy: { recipients: [stranger.tag] } }), /not on the payer's list/);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: ch, policy: { chainIds: [46630] } }), /not allowed/);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: ch, policy: { currencies: ["0x0000000000000000000000000000000000000001"] } }), /not allowed/);
  const roguePool = { ...ch, request: { ...ch.request, methodDetails: { ...(ch.request.methodDetails as object), pool: "0x000000000000000000000000000000000000dEaD" } } };
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: roguePool }), /not the Gloam pool/);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: await challengeFor(500n, { expires: new Date(Date.now() - 1000) }) }), /expired/);
  await assert.rejects(
    createGloamChargeCredential({ ...base, mode: "push", challenge: await challengeFor(500n, { expires: new Date(Date.now() + 10_000) }) }),
    /too little to settle a push payment/
  );
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: { ...ch, method: "tempo" } }), /Not a gloam charge/);
  await assert.rejects(createGloamChargeCredential({ ...base, challenge: await challengeFor(5000n) }), /does not cover/);
  assert.equal(proved, 0, "no proof was generated for a refused charge");
  assert.deepEqual(pool.submitted, []);
});

test("a credential lifted onto another challenge does not verify", async () => {
  const pool = mockPool();
  const chA = await challengeFor(300n);
  const chB = await challengeFor(300n); // same terms, different id (a different expiry second is enough)
  const chB2 = { ...chB, id: chB.id === chA.id ? `${chB.id}x` : chB.id };
  const paid = await pay(pool, chA, "push");
  const config = serverConfig(pool);
  await rejects(validateGloamCharge({ challenge: chB2, payload: paid.credential.payload, config }), /bound to a different challenge/);
  await rejects(validateGloamCharge({ challenge: { ...chA, realm: "evil.example" }, payload: paid.credential.payload, config }), /bound to a different challenge/);
  // A forged binding computed without the note secret fails the same way.
  const forged = { ...paid.credential.payload, binding: await challengeBinding({ secret: "0x01", realm: chA.realm, challengeId: chA.id, commitment: paid.built.paymentNote.commitment }) };
  await rejects(validateGloamCharge({ challenge: chA, payload: forged, config }), /bound to a different challenge/);
  // The honest pairing still settles.
  assert.equal((await settle(chA, paid.credential.payload, config)).status, "success");
});

test("wrong key, wrong recipient, wrong amount, asset, pool, event or mode are refused", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const paid = await pay(pool, ch, "push");

  // A server with another receive key cannot open the ticket, and a charge to another tag is not its to settle.
  await rejects(validateGloamCharge({ challenge: ch, payload: paid.credential.payload, config: serverConfig(pool, { receiveKey: stranger }) }), /different receive tag/);
  const chStranger = await challengeFor(400n, { recipient: stranger.tag });
  await rejects(validateGloamCharge({ challenge: chStranger, payload: paid.credential.payload, config: serverConfig(pool, { receiveKey: stranger }) }), /does not open/);

  // A note for another amount (the payer built it for a cheaper price) is refused even with a fresh binding.
  const cheap = await challengeFor(100n);
  const note = await fundedNote(pool, 1000n);
  const built = await buildGloamPayment({ requirements: toPaymentRequirements(parseGloamChargeRequest(cheap.request), ch.realm), senderSecretHex: note.secret, senderNoteAmountWei: note.amountWei, path: note.path, prove: stubProve });
  const hash = await pool.transfer(built.intent.exec.args);
  const under = await payloadFromPayment({ challenge: ch, payment: built, mode: "push", hash });
  await rejects(validateGloamCharge({ challenge: ch, payload: under, config: serverConfig(pool) }), /carries 100 base units; the charge is 400/);

  // A request naming some other pool is not settled.
  const rogue = { ...ch, request: { ...ch.request, methodDetails: { ...(ch.request.methodDetails as object), pool: "0x000000000000000000000000000000000000dEaD" } } };
  await rejects(validateGloamCharge({ challenge: rogue, payload: paid.credential.payload, config: serverConfig(pool) }), /not the Gloam pool/);

  // A hash whose receipt has no Transferred for this note (some other transfer).
  const other = await pay(pool, await challengeFor(400n), "push");
  const swapped = { ...paid.credential.payload, hash: (other.credential.payload as { hash: Hex }).hash };
  await rejects(validateGloamCharge({ challenge: ch, payload: swapped, config: serverConfig(pool) }), /not the payment output of a Transferred event/);

  // The right commitment, but the event came from a contract that is not the pool.
  const impostor = mockPool("0x000000000000000000000000000000000000bEEF");
  const chI = await challengeFor(400n);
  const n2 = await fundedNote(impostor, 1000n);
  const b2 = await buildGloamPayment({ requirements: toPaymentRequirements(parseGloamChargeRequest(chI.request), chI.realm), senderSecretHex: n2.secret, senderNoteAmountWei: n2.amountWei, path: n2.path, prove: stubProve });
  const h2 = await impostor.transfer(b2.intent.exec.args, "0x000000000000000000000000000000000000bEEF");
  const p2 = await payloadFromPayment({ challenge: chI, payment: b2, mode: "push", hash: h2 });
  await rejects(validateGloamCharge({ challenge: chI, payload: p2, config: serverConfig(impostor) }), /not the payment output of a Transferred event from the Gloam pool/);

  // A hash that is not mined yet: retry later.
  const pending = { ...paid.credential.payload, hash: `0x${"99".repeat(32)}` };
  await rejects(validateGloamCharge({ challenge: ch, payload: pending, config: serverConfig(pool) }), /not mined yet/, true);

  // A server that only takes pull refuses push.
  await rejects(validateGloamCharge({ challenge: ch, payload: paid.credential.payload, config: serverConfig(pool, { modes: ["pull"] }) }), /does not accept push/);

  // An expired challenge.
  const late = await challengeFor(400n, { expires: new Date(Date.now() - 1) });
  await assert.rejects(validateGloamCharge({ challenge: late, payload: paid.credential.payload, config: serverConfig(pool) }), (e: unknown) => e instanceof GloamChargeError && e.code === "payment-expired");

  // After all that, the honest credential still settles exactly once.
  assert.equal((await settle(ch, paid.credential.payload, serverConfig(pool))).status, "success");
});

test("a payer that spends the payment back before the sweep gets nothing", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const paid = await pay(pool, ch, "push");
  const back = await buildPrivateSendIntent({
    secretHex: paid.built.paymentNote.secret, amountInWei: 400n, amountPayWei: 400n, asset: USD,
    path: (await pool.chain.pathForCommitment(paid.built.paymentNote.commitment))!, prove: stubProve, poolAddress: POOL, chainId: CHAIN_ID,
  });
  await pool.transfer(back.exec.args);
  const config = serverConfig(pool);
  await rejects(settle(ch, paid.credential.payload, config), /already spent/);
  assert.equal(config.stored.length, 0, "nothing proved or stored");

  // Front-run: the payer spends it back between the check and the sweep.
  const ch2 = await challengeFor(400n);
  const paid2 = await pay(pool, ch2, "push");
  const frontRun = serverConfig(pool, {
    submit: async (intent) => {
      const steal = await buildPrivateSendIntent({
        secretHex: paid2.built.paymentNote.secret, amountInWei: 400n, amountPayWei: 400n, asset: USD,
        path: (await pool.chain.pathForCommitment(paid2.built.paymentNote.commitment))!, prove: stubProve, poolAddress: POOL, chainId: CHAIN_ID,
      });
      await pool.transfer(steal.exec.args);
      return pool.transfer(intent.exec.args);
    },
  });
  await rejects(settle(ch2, paid2.credential.payload, frontRun), /already spent|not yours|do not grant/i);
  // Nothing is remembered as settled: the replay record was dropped.
  const nf = fieldToHex(await noteNullifierPoseidon(hexToField(paid2.built.paymentNote.secret), hexToField(paid2.built.paymentNote.commitment)));
  assert.equal(await frontRun.replay!.get(nf), undefined);
});

test("pull: a transfer whose funding note was spent elsewhere is refused, and nothing is paid", async () => {
  const pool = mockPool();
  const ch = await challengeFor(200n);
  const paid = await pay(pool, ch, "pull");
  // The payer spends its funding note somewhere else first.
  const elsewhere = await buildPrivateSendIntent({
    secretHex: paid.note.secret, amountInWei: 1000n, amountPayWei: 1000n, asset: USD,
    path: paid.note.path, prove: stubProve, poolAddress: POOL, chainId: CHAIN_ID,
  });
  await pool.transfer(elsewhere.exec.args);
  await rejects(settle(ch, paid.credential.payload, serverConfig(pool)), /already spent elsewhere/);
});

test("a sweep whose receipt was lost is served once on retry, and never twice", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const paid = await pay(pool, ch, "push");
  const replay = memoryReplayStore();
  // First try: the sweep lands, then the RPC goes dark, so this server never hears back.
  let dark = false;
  const down = async (): Promise<never> => {
    throw new Error("timeout");
  };
  const lossy = serverConfig(pool, {
    replay,
    chain: {
      ...pool.chain,
      waitForReceipt: down,
      isCommitmentSeen: (c) => (dark ? down() : pool.chain.isCommitmentSeen(c)),
      isSpent: (n) => (dark ? down() : pool.chain.isSpent(n)),
    },
    submit: async (intent) => {
      const h = await pool.submitter("payee")(intent);
      dark = true;
      return h;
    },
  });
  await rejects(settle(ch, paid.credential.payload, lossy), /not confirmed|has not confirmed/, true);
  // Retry with the same credential once the chain answers again: served, exactly once.
  const healthy = serverConfig(pool, { replay });
  const receipt = await settle(ch, paid.credential.payload, healthy);
  assert.equal(receipt.status, "success");
  await rejects(settle(ch, paid.credential.payload, healthy), /already used/);
});

test("a challenge settles one payment: a second payment for it is refused before it is swept", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const config = serverConfig(pool);
  const first = await pay(pool, ch, "push");
  assert.equal((await settle(ch, first.credential.payload, config)).status, "success");
  const second = await pay(pool, ch, "pull");
  await assert.rejects(validateGloamCharge({ challenge: ch, payload: second.credential.payload, config }), (e: unknown) => e instanceof GloamChargeError && e.code === "invalid-challenge");
  await assert.rejects(settle(ch, second.credential.payload, config), (e: unknown) => e instanceof GloamChargeError && e.code === "invalid-challenge");
  assert.equal(config.stored.length, 1, "only the first payment was swept");
  assert.equal(await pool.chain.isCommitmentSeen(second.built.paymentNote.commitment), false, "the second payer's transfer was never submitted");

  // Two different payments for one challenge at once: one settles, the other waits and is then refused.
  const ch2 = await challengeFor(400n);
  const a = await pay(pool, ch2, "push");
  const b = await pay(pool, ch2, "push");
  const both = await Promise.allSettled([settle(ch2, a.credential.payload, config), settle(ch2, b.credential.payload, config)]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(both.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
});

test("the same credential settling twice at once yields one receipt", async () => {
  const pool = mockPool();
  const ch = await challengeFor(400n);
  const paid = await pay(pool, ch, "push");
  const config = serverConfig(pool);
  const results = await Promise.allSettled([1, 2, 3].map(() => settle(ch, paid.credential.payload, config)));
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, JSON.stringify(results.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
  assert.equal(pool.submitted.filter((s) => s === "payee").length, 1, "one sweep");
});
