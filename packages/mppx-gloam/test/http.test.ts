/**
 * The gloam method over HTTP: the Fetch paywall (no MPP library) and the mppx
 * adapters (mppx/server + mppx/client), each paid end to end against an
 * in-memory pool, plus the refusals a server must answer with a fresh 402.
 */
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReceiveKey, type NoteExport } from "@gloamtrade/sdk";
import { Mppx as MppxServer } from "mppx/server";
import { Mppx as MppxClient } from "mppx/client";
import {
  createGloamChargeCredential,
  createGloamPaywall,
  createPaymentChallenge,
  credentialField,
  encodeJsonParam,
  memoryReplayStore,
  parseCredential,
  parsePaymentChallenges,
  parseReceipt,
  serializeCredential,
  GLOAM_CHARGE_INTENT,
  GLOAM_METHOD,
  type GloamChargeServerConfig,
} from "../src/core.js";
import { gloam as gloamServer } from "../src/mppx/server.js";
import { gloam as gloamClient } from "../src/mppx/client.js";
import { fundedNote, mockPool, stubProve, CHAIN_ID, POOL, USD, type MockPool } from "./helpers.js";

// Random per run: a fixed string here only trips secret scanners.
const SECRET = randomBytes(24).toString("hex");
const payee = await generateReceiveKey();
const URL_ = "https://api.example.com/answer";

function server(pool: MockPool): GloamChargeServerConfig & { stored: NoteExport[] } {
  const stored: NoteExport[] = [];
  return {
    receiveKey: payee,
    chain: pool.chain,
    prove: stubProve,
    submit: pool.submitter("payee"),
    replay: memoryReplayStore(),
    beforeSubmit: (n) => void stored.push(n),
    stored,
  };
}

async function problemOf(res: Response) {
  return JSON.parse(await res.text()) as { type: string; detail: string; status: number };
}

test("paywall: 402 challenge -> private payment -> 200 with a receipt; refusals get a fresh 402", async () => {
  const pool = mockPool();
  const config = server(pool);
  const paywall = createGloamPaywall({ secretKey: SECRET, server: config, network: "tempo" });
  const handle = async (req: Request) => {
    const r = await paywall.charge({ amount: "0.0004", description: "one answer" })(req);
    if (r.status === 402) return r.challenge;
    return r.withReceipt(Response.json({ answer: 42 }));
  };

  // 1. No credential: a 402 that names the gloam method.
  const first = await handle(new Request(URL_));
  assert.equal(first.status, 402);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.headers.get("content-type"), "application/problem+json");
  assert.equal((await problemOf(first.clone())).type, "https://paymentauth.org/problems/payment-required");
  const [ch] = parsePaymentChallenges(first.headers.get("www-authenticate"));
  assert.ok(ch);
  assert.equal(ch.method, GLOAM_METHOD);
  assert.equal(ch.intent, GLOAM_CHARGE_INTENT);
  assert.equal(ch.realm, "api.example.com");
  assert.equal(ch.description, "one answer");
  assert.deepEqual(ch.request, { amount: "400", currency: USD, recipient: payee.tag, methodDetails: { chainId: CHAIN_ID, pool: POOL, decimals: 6 } });
  assert.ok(ch.expires && Date.parse(ch.expires) > Date.now() + 500_000, "a gloam challenge leaves time to prove and confirm");

  // 2. The agent pays privately and retries.
  const note = await fundedNote(pool, 1000n);
  const paid = await createGloamChargeCredential({ challenge: ch, note, prove: stubProve, submit: pool.submitter("payer"), waitForReceipt: pool.chain.waitForReceipt });
  const retry = (auth: string, field = credentialField(ch)) => handle(new Request(URL_, { headers: { [field]: auth } }));
  const ok = await retry(paid.authorization);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.deepEqual(await ok.clone().json(), { answer: 42 });
  assert.equal(ok.headers.get("cache-control"), "private");
  const receipt = parseReceipt(ok.headers.get("payment-receipt")!);
  assert.equal(receipt.method, "gloam");
  assert.equal(receipt.challengeId, ch.id);
  assert.equal(config.stored.length, 1, "the payment was swept into a note the payee holds");

  // 3. Replay: refused with a fresh challenge.
  const again = await retry(paid.authorization);
  assert.equal(again.status, 402);
  assert.match((await problemOf(again)).detail, /already used/);
  assert.ok(again.headers.get("www-authenticate"), "a refusal carries a fresh challenge");

  // 4. A challenge edited by the client (cheaper amount, same id) fails the HMAC.
  const edited = { ...ch, request: { ...ch.request, amount: "1" }, requestB64: encodeJsonParam({ ...ch.request, amount: "1" }) };
  const tampered = await retry(serializeCredential({ challenge: edited, payload: paid.credential.payload }));
  assert.equal(tampered.status, 402);
  assert.equal((await problemOf(tampered)).type, "https://paymentauth.org/problems/invalid-challenge");

  // 5. A real challenge from this server, but for another route's price, is not accepted here.
  const cheap = await paywall.charge({ amount: "0.0001" })(new Request(URL_));
  assert.equal(cheap.status, 402);
  const [cheapCh] = parsePaymentChallenges((cheap as { challenge: Response }).challenge.headers.get("www-authenticate"));
  const note2 = await fundedNote(pool, 1000n);
  const cheapPaid = await createGloamChargeCredential({ challenge: cheapCh!, note: note2, prove: stubProve, mode: "pull" });
  const wrongRoute = await retry(cheapPaid.authorization);
  assert.equal(wrongRoute.status, 402);
  assert.match((await problemOf(wrongRoute)).detail, /different amount/);

  // 6. A challenge minted with someone else's secret.
  const foreign = await createPaymentChallenge({ secretKey: "x".repeat(40), realm: ch.realm, method: "gloam", intent: "charge", request: ch.request, expires: ch.expires });
  const notOurs = await retry(serializeCredential({ challenge: foreign, payload: paid.credential.payload }));
  assert.match((await problemOf(notOurs)).detail, /not issued by this server/);

  // 7. Garbage.
  const junk = await retry("Payment bm90LWpzb24");
  assert.equal((await problemOf(junk)).type, "https://paymentauth.org/problems/malformed-credential");

  // 8. A transfer that is not mined yet: retryable, with Retry-After.
  const note3 = await fundedNote(pool, 1000n);
  const [ch3] = parsePaymentChallenges((await handle(new Request(URL_))).headers.get("www-authenticate"));
  const pull3 = await createGloamChargeCredential({ challenge: ch3!, note: note3, prove: stubProve, mode: "pull" });
  const fake = serializeCredential({
    challenge: ch3!,
    payload: { type: "hash", hash: `0x${"77".repeat(32)}`, ticket: pull3.credential.payload.ticket, binding: pull3.credential.payload.binding },
  });
  const notYet = await retry(fake);
  assert.equal(notYet.status, 402);
  assert.equal(notYet.headers.get("retry-after"), "5");
});

test("paywall in Payment-Authorization mode leaves Authorization to the app", async () => {
  const pool = mockPool();
  const paywall = createGloamPaywall({ secretKey: SECRET, server: server(pool), paymentAuthorizationHeader: true });
  const charge = paywall.charge({ amountWei: 400n });
  const first = await charge(new Request(URL_, { headers: { Authorization: "Bearer app-session" } }));
  assert.equal(first.status, 402);
  const [ch] = parsePaymentChallenges((first as { challenge: Response }).challenge.headers.get("www-authenticate"));
  assert.equal(ch!.header, "Payment-Authorization");
  assert.equal(credentialField(ch!), "Payment-Authorization");
  const paid = await createGloamChargeCredential({ challenge: ch!, note: await fundedNote(pool, 1000n), prove: stubProve, mode: "pull" });
  assert.equal(parseCredential(paid.authorization).challenge.header, "Payment-Authorization", "the selected field is echoed");
  // In Authorization it does not count.
  const wrongField = await charge(new Request(URL_, { headers: { Authorization: paid.authorization } }));
  assert.equal(wrongField.status, 402);
  const ok = await charge(new Request(URL_, { headers: { Authorization: "Bearer app-session", "Payment-Authorization": paid.authorization } }));
  assert.equal(ok.status, 200);
});

test("mppx: Mppx.create with gloam() on both sides pays a route privately", async () => {
  const pool = mockPool();
  const config = server(pool);
  const mppx = MppxServer.create({
    secretKey: SECRET,
    realm: "api.example.com",
    methods: [gloamServer({ ...config, network: "tempo" })],
  });
  const seen: { status: number; challenge: string | null }[] = [];
  const app = async (req: Request) => {
    const r = await mppx.charge({ amount: "0.0004", description: "one answer" })(req);
    if (r.status === 402) {
      seen.push({ status: 402, challenge: r.challenge.headers.get("www-authenticate") });
      return r.challenge;
    }
    seen.push({ status: 200, challenge: null });
    return r.withReceipt(Response.json({ answer: 42 }));
  };
  const inProcess = (async (input: RequestInfo | URL, init?: RequestInit) => app(new Request(input, init))) as typeof fetch;

  // The challenge mppx issues for gloam reads with our parser and carries the gloam terms.
  const probe = await app(new Request(URL_));
  const [mch] = parsePaymentChallenges(probe.headers.get("www-authenticate"));
  assert.equal(mch!.method, "gloam");
  assert.deepEqual(mch!.request, { amount: "400", currency: USD, recipient: payee.tag, methodDetails: { chainId: CHAIN_ID, pool: POOL, decimals: 6 } });

  const note = await fundedNote(pool, 1000n);
  let gotNoteFor: unknown = null;
  const client = MppxClient.create({
    polyfill: false,
    fetch: inProcess,
    methods: [
      gloamClient({
        getNote: async (want) => {
          gotNoteFor = want;
          return note;
        },
        prove: stubProve,
        submit: pool.submitter("payer"),
        waitForReceipt: pool.chain.waitForReceipt,
        mode: "push",
        policy: { maxAmountWei: 1000n, currencies: [USD] },
      }),
    ],
  });
  const res = await client.fetch(URL_);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { answer: 42 });
  assert.deepEqual(gotNoteFor, { chainId: CHAIN_ID, pool: POOL, currency: USD, amountWei: 400n });
  const receipt = parseReceipt(res.headers.get("payment-receipt")!);
  assert.equal(receipt.method, "gloam");
  assert.equal(receipt.chainId, CHAIN_ID);
  assert.deepEqual(pool.submitted, ["payer", "payee"], "the payer paid, the payee swept");
  assert.equal(config.stored[0]!.amountWei, "400");

  // Pull through mppx too: the payer submits nothing.
  const note2 = await fundedNote(pool, 1000n);
  const pullClient = MppxClient.create({
    polyfill: false,
    fetch: inProcess,
    methods: [gloamClient({ getNote: async () => note2, prove: stubProve, mode: "pull" })],
  });
  const before = pool.submitted.length;
  const res2 = await pullClient.fetch(URL_);
  assert.equal(res2.status, 200, await res2.clone().text());
  assert.deepEqual(pool.submitted.slice(before), ["payee", "payee"]);

  // A challenge that was already paid does not take a second payment (single use), and nothing is swept.
  const firstPaid = seen.findIndex((s) => s.status === 200);
  assert.ok(firstPaid > 0);
  const usedChallenge = parsePaymentChallenges(seen[firstPaid - 1]!.challenge)[0]!;
  const second = await createGloamChargeCredential({ challenge: usedChallenge, note: await fundedNote(pool, 1000n), prove: stubProve, mode: "pull" });
  const sweepsBefore = pool.submitted.length;
  const reused = await app(new Request(URL_, { headers: { Authorization: second.authorization } }));
  assert.equal(reused.status, 402);
  assert.match(await reused.text(), /invalid-challenge|already paid and used/);
  assert.equal(pool.submitted.length, sweepsBefore, "the second payment was not taken");

  // A credential built with the core client for a fresh challenge is accepted; replaying it is refused.
  const chal = parsePaymentChallenges((await app(new Request(URL_))).headers.get("www-authenticate"))[0]!;
  const note3 = await fundedNote(pool, 1000n);
  const manual = await createGloamChargeCredential({ challenge: chal, note: note3, prove: stubProve, mode: "pull" });
  const ok3 = await app(new Request(URL_, { headers: { Authorization: manual.authorization } }));
  assert.equal(ok3.status, 200, "a credential built with the core client is accepted by the mppx server");
  const replay = await app(new Request(URL_, { headers: { Authorization: manual.authorization } }));
  assert.equal(replay.status, 402);
  assert.match(await replay.text(), /already used/);
});
