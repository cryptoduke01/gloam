/**
 * MPP (Machine Payments Protocol) through the Gloam MCP tools, end to end over
 * an in-memory MCP transport and a mock pool. Nothing is broadcast.
 *
 *   pnpm --filter @gloamtrade/mcp exec tsx --test scripts/test-mpp.mts
 *
 * Covers: gloam_payment_requirements emitting an HMAC-bound MPP challenge,
 * gloam_fetch_paid paying an MPP 402 (preferred over x402 when both are
 * offered) and presenting Authorization: Payment, gloam_execute_private_pay
 * returning the credential, gloam_verify_payment checking the challenge id,
 * expiry, price, binding and Transferred event before sweeping and issuing a
 * Payment-Receipt, replays, a credential lifted onto another challenge, a pull
 * credential the payee submits itself, spending limits still gating every
 * payment, and that no tool result carries a secret.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Address, Hex } from "viem";
import {
  IncrementalMerkleTreePoseidon,
  fieldToHex,
  hexToField,
  noteCommitmentPoseidon,
  GLOAM_NETWORKS,
  TEMPO_PATHUSD,
} from "@gloamtrade/sdk";
import {
  createGloamChargeCredential,
  createPaymentChallenge,
  encodeJsonParam,
  parseCredential,
  parsePaymentChallenges,
  parseReceipt,
  serializeCredential,
  verifyChallengeId,
  TRANSFERRED_TOPIC,
} from "@gloamtrade/mppx-gloam/core";
import { createGloamServer, type ServerDeps } from "../src/server.js";
import type { Signer } from "../src/signer.js";
import { openNoteStore } from "../src/noteStore.js";
import { mppSecret } from "../src/mpp.js";

type Env = Record<string, string | undefined>;
const TEMPO = GLOAM_NETWORKS.tempo;
const stub = async () => ({ proofBytes: "0xdeadbeef" as Hex });
const tmp = () => mkdtempSync(join(tmpdir(), "gloam-mpp-"));
const lc = (h: string) => h.toLowerCase();

/** A pool that follows the contract's rules for shieldBound and transfer, with Transferred logs in its receipts. */
function mockChain() {
  const tree = new IncrementalMerkleTreePoseidon();
  const index = new Map<string, number>();
  const roots = new Set<string>();
  const spent = new Set<string>();
  const receipts = new Map<string, { status: "success" | "reverted"; logs: { address: Address; topics: Hex[]; data: Hex }[] }>();
  const calls: string[] = [];
  let n = 0;
  const insert = async (c: string) => {
    index.set(lc(c), await tree.insert(hexToField(c)));
    roots.add(lc(fieldToHex(tree.currentRoot)));
  };
  async function apply(fn: string, args: readonly unknown[], address: Address = TEMPO.pool): Promise<Hex> {
    const hash = `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
    let ok = true;
    const logs: { address: Address; topics: Hex[]; data: Hex }[] = [];
    if (fn === "shieldBound") {
      const c = String(args[2]);
      ok = !index.has(lc(c));
      if (ok) await insert(c);
    } else if (fn === "transfer") {
      const [, root, nullifier, outs] = args as [Hex, Hex, Hex, Hex[]];
      ok = roots.has(lc(root)) && !spent.has(lc(nullifier)) && outs.every((c) => !index.has(lc(c)));
      if (ok) {
        spent.add(lc(nullifier));
        for (const c of outs) await insert(c);
        logs.push({ address, topics: [TRANSFERRED_TOPIC, lc(nullifier) as Hex], data: `0x${outs.map((c) => lc(c).slice(2)).join("")}` as Hex });
      }
    }
    receipts.set(hash, { status: ok ? "success" : "reverted", logs });
    return hash;
  }
  const receiptOf = (hash: Hex) => {
    const r = receipts.get(hash);
    if (!r) throw Object.assign(new Error(`Transaction receipt with hash "${hash}" could not be found.`), { name: "TransactionReceiptNotFoundError" });
    return { ...r, from: "0x0000000000000000000000000000000000000abc" };
  };
  const publicClient = {
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => receiptOf(hash),
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => receiptOf(hash),
    readContract: async ({ functionName, args }: { functionName: string; args: [Hex] }) =>
      functionName === "isSpent" ? spent.has(lc(args[0])) : index.has(lc(args[0])),
  };
  const walletClient = {
    writeContract: async ({ functionName, args, address }: { functionName: string; args: readonly unknown[]; address: Address }) => {
      calls.push(functionName);
      return apply(functionName, args, address);
    },
    sendTransaction: async () => apply("send", []),
  };
  const syncTree = async () => ({
    pathForCommitment: async (c: Hex) => (index.has(lc(c)) ? tree.path(index.get(lc(c))!) : null),
  });
  return { publicClient, walletClient, syncTree, calls, apply, insert, spent, path: (c: Hex) => tree.path(index.get(lc(c))!) };
}
type Chain = ReturnType<typeof mockChain>;

function makeDeps(chain: Chain, env: Env, extra: Partial<ServerDeps> = {}) {
  const proofs = { count: 0 };
  const prover = async () => {
    proofs.count++;
    return { proofBytes: "0xdeadbeef" as Hex };
  };
  const deps: Partial<ServerDeps> = {
    env,
    signer: (net) =>
      env.GLOAM_AGENT_PRIVATE_KEY
        ? ({ account: { address: "0x0000000000000000000000000000000000000abc" }, network: net, walletClient: chain.walletClient, publicClient: chain.publicClient } as unknown as Signer)
        : null,
    publicClient: () => chain.publicClient as unknown as Signer["publicClient"],
    shieldProver: async () => prover,
    transferProver: async () => prover,
    syncTree: chain.syncTree as unknown as ServerDeps["syncTree"],
    relay: async (intent) => chain.apply("transfer", intent.exec!.args),
    ...extra,
  };
  return { deps, proofs };
}

const seen: string[] = [];
async function connect(deps: Partial<ServerDeps>) {
  const server = createGloamServer(deps);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "gloam-mpp-test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const raw = (r.content as { type: string; text: string }[])[0]!.text;
    seen.push(raw);
    return JSON.parse(raw);
  };
}

function partyEnv(name: string, dir: string, over: Env = {}): Env {
  return {
    GLOAM_AGENT_ID: name,
    GLOAM_AGENT_PRIVATE_KEY: `0x${(name.startsWith("payer") ? "11" : "22").repeat(32)}`,
    GLOAM_NOTE_STORE: join(dir, `${name}-notes.json`),
    GLOAM_SPEND_LOG: join(dir, `${name}-log.json`),
    ...over,
  };
}
const PAYER_LIMITS: Env = {
  GLOAM_LIMIT_ASSETS: "PathUSD",
  GLOAM_LIMIT_MAX_PER_PAYMENT: "10",
  GLOAM_LIMIT_MAX_PER_DAY: "50",
  GLOAM_LIMIT_RECIPIENTS: "any",
  GLOAM_LIMIT_TOOLS: "pay,shield",
};

function assertNoSecrets(envs: Env[]) {
  const secrets: string[] = [];
  for (const env of envs) {
    const store = openNoteStore(env);
    for (const n of store.list()) secrets.push(n.secret.slice(2).toLowerCase(), hexToField(n.secret).toString());
    const rk = store.receiveKey();
    if (rk?.privateJwk.d) secrets.push(rk.privateJwk.d);
  }
  for (const raw of seen) {
    const low = raw.toLowerCase();
    for (const s of secrets.filter((x) => x.length >= 20)) assert.ok(!low.includes(s.toLowerCase()), `a tool result leaked a secret: ${raw.slice(0, 200)}`);
  }
}

async function setup() {
  const dir = tmp();
  const chain = mockChain();
  const payeeEnv = partyEnv("payee", dir, { GLOAM_LIMITS: "off" });
  const payerEnv = partyEnv("payer", dir, PAYER_LIMITS);
  return { dir, chain, payeeEnv, payerEnv };
}

const price = (call: Awaited<ReturnType<typeof connect>>, amount = 1, extra: Record<string, unknown> = {}) =>
  call("gloam_payment_requirements", {
    amount,
    decimals: 6,
    assetSymbol: "PathUSD",
    asset: TEMPO_PATHUSD,
    resource: "https://api.example.com/answer",
    network: "tempo",
    ...extra,
  });

test("gloam_payment_requirements also prices in MPP: an HMAC-bound gloam/charge challenge", async () => {
  const { chain, payeeEnv } = await setup();
  const S = await connect(makeDeps(chain, payeeEnv).deps);
  const priced = await price(S, 2.5, { realm: "api.example.com" });
  assert.ok(priced.encoded.startsWith("gloamx402req1:"), "x402 is still there");
  const [ch] = parsePaymentChallenges(priced.mpp.wwwAuthenticate);
  assert.ok(ch, JSON.stringify(priced.mpp));
  assert.equal(ch.method, "gloam");
  assert.equal(ch.intent, "charge");
  assert.equal(ch.realm, "api.example.com");
  assert.equal(ch.id, priced.mpp.challengeId);
  assert.deepEqual(ch.request, {
    amount: "2500000",
    currency: TEMPO_PATHUSD,
    recipient: priced.requirements.payTo,
    description: priced.requirements.description,
    methodDetails: { chainId: TEMPO.chainId, pool: TEMPO.pool, decimals: 6 },
  });
  assert.ok(Date.parse(ch.expires!) - Date.now() > 590_000, "ten minutes by default");
  assert.equal(await verifyChallengeId(ch, mppSecret(payeeEnv)), true, "bound with this server's key");

  // With MPP_SECRET_KEY the id is the plain mppx construction over that key.
  const shared = "a-shared-mpp-secret-key-of-32-characters!";
  const S2 = await connect(makeDeps(chain, { ...payeeEnv, MPP_SECRET_KEY: shared }).deps);
  const [ch2] = parsePaymentChallenges((await price(S2)).mpp.wwwAuthenticate);
  assert.equal(await verifyChallengeId(ch2!, shared), true);
  const S3 = await connect(makeDeps(chain, { ...payeeEnv, MPP_SECRET_KEY: "short" }).deps);
  assert.match((await price(S3)).mpp.error, /at least 32/);
  const S4 = await connect(makeDeps(chain, { ...payeeEnv, GLOAM_MPP_SECRET_KEY: shared }).deps);
  const [ch4] = parsePaymentChallenges((await price(S4)).mpp.wwwAuthenticate);
  assert.equal(await verifyChallengeId(ch4!, shared), true, "GLOAM_MPP_SECRET_KEY works too (it can live in the settings file)");
});

test("gloam_fetch_paid pays an MPP 402 privately, prefers it over x402, and returns the receipt", async () => {
  const { chain, payeeEnv, payerEnv } = await setup();
  const S = await connect(makeDeps(chain, payeeEnv).deps);
  const priced = await price(S, 1);
  const presented: { auth: string | null; xpay: string | null }[] = [];
  // A resource server offering both dialects, serving only after its Gloam MCP says grantAccess.
  const resource = (async (_url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const auth = h.get("authorization");
    presented.push({ auth, xpay: h.get("x-payment") });
    if (!auth) {
      return new Response(JSON.stringify({ x402Version: 1, accepts: [priced.requirements] }), {
        status: 402,
        headers: { "content-type": "application/json", "www-authenticate": `Bearer realm="api", ${priced.mpp.wwwAuthenticate}`, "cache-control": "no-store" },
      });
    }
    const v = await S("gloam_verify_payment", { payment: auth, requirements: priced.mpp.wwwAuthenticate });
    return v.grantAccess
      ? new Response("the answer is 42", { status: 200, headers: { "payment-receipt": v.paymentReceipt, "cache-control": "private" } })
      : new Response(JSON.stringify(v), { status: 402 });
  }) as typeof fetch;

  const { deps, proofs } = makeDeps(chain, payerEnv, { fetch: resource });
  const P = await connect(deps);
  assert.equal((await P("gloam_execute_shield", { amount: 5, network: "tempo" })).status, "confirmed");

  const tooMuch = await P("gloam_fetch_paid", { url: "https://api.example.com/answer", maxAmount: 0.5 });
  assert.equal(tooMuch.code, "over_max_amount");

  const proofsBefore = proofs.count;
  const r = await P("gloam_fetch_paid", { url: "https://api.example.com/answer" });
  assert.equal(r.status, "ok", JSON.stringify(r));
  assert.equal(r.protocol, "mpp");
  assert.equal(r.body, "the answer is 42");
  assert.equal(r.paid.amount, "1");
  assert.equal(r.paymentReceipt.method, "gloam");
  assert.equal(r.paymentReceipt.status, "success");
  assert.equal(r.paymentReceipt.challengeId, parsePaymentChallenges(priced.mpp.wwwAuthenticate)[0]!.id);
  assert.equal(r.paymentHeader, undefined, "a served request does not hand the credential to the agent");
  assert.equal(proofs.count, proofsBefore + 1, "one transfer proof");
  const last = presented.at(-1)!;
  assert.match(last.auth!, /^Payment [A-Za-z0-9_-]+$/, "the retry carried an MPP credential");
  assert.equal(last.xpay, null, "and no x402 header");
  const cred = parseCredential<{ type: string; ticket: string }>(last.auth!);
  assert.equal(cred.payload.type, "hash", "the MCP pays in push mode");
  assert.match(cred.payload.ticket, /^gloam2t\./, "the payment note is sealed to the payee");

  // The payee holds the money in a fresh note, and the same credential cannot buy a second answer.
  const received = openNoteStore(payeeEnv).list().filter((n) => n.origin === "received");
  assert.equal(received.length, 1);
  assert.equal(received[0]!.amountWei, "1000000");
  const again = await P("gloam_fetch_paid", { url: "https://api.example.com/answer", paymentHeader: last.auth! });
  assert.equal(again.status, "payment_not_accepted");

  // The spend went through the limits and the log, exactly like x402.
  const report = await P("gloam_get_spending_report", {});
  assert.ok(
    report.recentPayments.some((x: { tool: string; amount: string; status: string }) => x.tool === "pay" && x.amount === "1" && x.status === "sent"),
    JSON.stringify(report)
  );

  assertNoSecrets([payerEnv, payeeEnv]);
});

test("execute_private_pay + verify_payment with an MPP challenge: binding, replay, tampering, price", async () => {
  const { chain, payeeEnv, payerEnv } = await setup();
  const S = await connect(makeDeps(chain, payeeEnv).deps);
  const P = await connect(makeDeps(chain, payerEnv).deps);
  await P("gloam_execute_shield", { amount: 10, network: "tempo" });
  const priced = await price(S, 2);

  // The planner reads the MPP challenge too.
  const plan = await P("gloam_pay_x402", { requirements: priced.mpp.wwwAuthenticate });
  assert.equal(plan.protocol, "mpp");
  assert.equal(plan.mpp.payable, "yes");

  const paid = await P("gloam_execute_private_pay", { requirements: priced.mpp.wwwAuthenticate });
  assert.equal(paid.status, "paid", JSON.stringify(paid));
  assert.equal(paid.protocol, "mpp");
  assert.equal(paid.authorizationField, "Authorization");
  assert.match(paid.authorization, /^Payment /);
  assert.equal(paid.paymentHeader, undefined);
  assert.equal(paid.change.amount, "8");

  // A credential lifted onto another challenge from the same server (same price) does not verify.
  const other = parsePaymentChallenges((await price(S, 2, { expiresInSeconds: 900 })).mpp.wwwAuthenticate)[0]!;
  assert.notEqual(other.id, parseCredential(paid.authorization).challenge.id);
  const cred = parseCredential(paid.authorization);
  const lifted = await S("gloam_verify_payment", { payment: serializeCredential({ challenge: other, payload: cred.payload }) });
  assert.equal(lifted.status, "rejected");
  assert.match(lifted.message, /bound to a different challenge/);

  // An edited challenge (cheaper) fails the HMAC.
  const ch = cred.challenge;
  const edited = { ...ch, request: { ...ch.request, amount: "1" }, requestB64: encodeJsonParam({ ...ch.request, amount: "1" }) };
  const tampered = await S("gloam_verify_payment", { payment: serializeCredential({ challenge: edited, payload: cred.payload }) });
  assert.equal(tampered.problem, "invalid-challenge");
  assert.match(tampered.message, /not issued by this server/);

  // A challenge minted with someone else's key.
  const foreign = await createPaymentChallenge({ secretKey: "z".repeat(40), realm: ch.realm, method: "gloam", intent: "charge", request: ch.request, expires: ch.expires });
  const notOurs = await S("gloam_verify_payment", { payment: serializeCredential({ challenge: foreign, payload: cred.payload }) });
  assert.match(notOurs.message, /not issued by this server/);

  // Bound to the price of another resource: refused.
  const pricier = await price(S, 3);
  const wrongPrice = await S("gloam_verify_payment", { payment: paid.authorization, requirements: pricier.encoded });
  assert.equal(wrongPrice.status, "rejected");
  assert.match(wrongPrice.message, /different amount/);

  // The honest credential settles once, with a receipt; the replay is refused.
  const v = await S("gloam_verify_payment", { payment: paid.authorization, requirements: priced.encoded });
  assert.equal(v.status, "settled", JSON.stringify(v));
  assert.equal(v.grantAccess, true);
  assert.equal(v.received.amount, "2");
  const receipt = parseReceipt(v.paymentReceipt);
  assert.equal(receipt.method, "gloam");
  assert.equal(receipt.reference, v.hash);
  assert.equal(receipt.challengeId, ch.id);
  assert.equal(receipt.chainId, TEMPO.chainId);
  const replay = await S("gloam_verify_payment", { payment: paid.authorization });
  assert.equal(replay.status, "already_settled");
  assert.equal(replay.grantAccess, false);

  // A second, different payment for the same (already used) challenge is refused before it is swept.
  const paidAgain = await P("gloam_execute_private_pay", { requirements: priced.mpp.wwwAuthenticate });
  assert.equal(paidAgain.status, "paid", JSON.stringify(paidAgain));
  const receivedBefore = openNoteStore(payeeEnv).list().length;
  const reuse = await S("gloam_verify_payment", { payment: paidAgain.authorization });
  assert.equal(reuse.status, "rejected");
  assert.equal(reuse.problem, "invalid-challenge");
  assert.match(reuse.message, /already paid and used/);
  assert.equal(openNoteStore(payeeEnv).list().length, receivedBefore, "nothing swept or stored");

  assertNoSecrets([payerEnv, payeeEnv]);
});

test("verify_payment settles a pull credential by submitting the payer's transfer itself", async () => {
  const { chain, payeeEnv } = await setup();
  const S = await connect(makeDeps(chain, payeeEnv).deps);
  const ch = parsePaymentChallenges((await price(S, 1)).mpp.wwwAuthenticate)[0]!;
  // A payer using @gloamtrade/mppx-gloam directly, in pull mode: it broadcasts nothing.
  const secret = 777_777n;
  const c = fieldToHex(await noteCommitmentPoseidon(secret, 3_000_000n, TEMPO_PATHUSD));
  await chain.insert(c);
  const pulled = await createGloamChargeCredential({
    challenge: ch,
    note: { secret: fieldToHex(secret), amountWei: 3_000_000n, path: await chain.path(c) },
    prove: stub,
    mode: "pull",
  });
  assert.equal(chain.calls.length, 0, "the payer submitted nothing");
  const v = await S("gloam_verify_payment", { payment: pulled.authorization });
  assert.equal(v.status, "settled", JSON.stringify(v));
  assert.equal(v.paymentSubmittedBy, "server wallet");
  assert.deepEqual(chain.calls, ["transfer", "transfer"], "the payee submitted the payment, then swept it");
  assert.ok(parseReceipt(v.paymentReceipt).reference);
  const again = await S("gloam_verify_payment", { payment: pulled.authorization });
  assert.equal(again.status, "already_settled");

  // A payee without a signer or relay checks it but does not move anything.
  const dir2 = tmp();
  const noKeyEnv: Env = { GLOAM_AGENT_ID: "shop", GLOAM_NOTE_KEY: "ab".repeat(32), GLOAM_NOTE_STORE: join(dir2, "shop.json") };
  const N = await connect(makeDeps(chain, noKeyEnv).deps);
  const ch2 = parsePaymentChallenges((await price(N, 1)).mpp.wwwAuthenticate)[0]!;
  const s2 = 888_888n;
  const c2 = fieldToHex(await noteCommitmentPoseidon(s2, 1_000_000n, TEMPO_PATHUSD));
  await chain.insert(c2);
  const pulled2 = await createGloamChargeCredential({ challenge: ch2, note: { secret: fieldToHex(s2), amountWei: 1_000_000n, path: await chain.path(c2) }, prove: stub, mode: "pull" });
  const before = chain.calls.length;
  const nv = await N("gloam_verify_payment", { payment: pulled2.authorization });
  assert.equal(nv.status, "verified_not_final");
  assert.equal(nv.grantAccess, false);
  assert.equal(chain.calls.length, before, "nothing submitted");
});

test("the MCP refuses MPP challenges it cannot honor, before proving or spending", async () => {
  const { chain, payeeEnv, payerEnv } = await setup();
  const S = await connect(makeDeps(chain, payeeEnv).deps);
  const { deps, proofs } = makeDeps(chain, payerEnv);
  const P = await connect(deps);
  await P("gloam_execute_shield", { amount: 10, network: "tempo" });
  payerEnv.GLOAM_LIMIT_MAX_PER_PAYMENT = "5"; // the owner tightens the cap; read on every call
  const proofsBefore = proofs.count;
  const priced = await price(S, 1);
  const ch = parsePaymentChallenges(priced.mpp.wwwAuthenticate)[0]!;
  const reissue = async (request: Record<string, unknown>, expires = ch.expires) =>
    (await createPaymentChallenge({ secretKey: "q".repeat(40), realm: ch.realm, method: "gloam", intent: "charge", request, expires })) as typeof ch;
  const { formatPaymentChallenge } = await import("@gloamtrade/mppx-gloam/core");

  const pullOnly = await reissue({ ...ch.request, methodDetails: { ...(ch.request.methodDetails as object), supportedModes: ["pull"] } });
  const r1 = await P("gloam_execute_private_pay", { requirements: formatPaymentChallenge(pullOnly) });
  assert.equal(r1.code, "mpp_unpayable");
  assert.match(r1.message, /only accepts pull/);

  const late = await reissue(ch.request, new Date(Date.now() + 5_000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  const r2 = await P("gloam_execute_private_pay", { requirements: formatPaymentChallenge(late) });
  assert.equal(r2.code, "mpp_unpayable");
  assert.match(r2.message, /too little/);

  // Over the per-payment limit: the limits gate an MPP payment exactly like x402.
  const big = await reissue({ ...ch.request, amount: "6000000" });
  const r3 = await P("gloam_execute_private_pay", { requirements: formatPaymentChallenge(big) });
  assert.equal(r3.status, "refused");
  assert.equal(r3.code, "over_per_payment");

  // A rogue pool is refused by the spend gate.
  const rogue = await reissue({ ...ch.request, methodDetails: { ...(ch.request.methodDetails as object), pool: "0x000000000000000000000000000000000000dEaD" } });
  const r4 = await P("gloam_execute_private_pay", { requirements: formatPaymentChallenge(rogue) });
  assert.notEqual(r4.status, "paid", JSON.stringify(r4));

  // Some other method entirely.
  const tempoCh = await createPaymentChallenge({ secretKey: "q".repeat(40), realm: "r", method: "tempo", intent: "charge", request: { amount: "1" } });
  const r5 = await P("gloam_execute_private_pay", { requirements: formatPaymentChallenge(tempoCh) });
  assert.equal(r5.status, "error");
  assert.match(r5.error, /not a gloam\/charge/);

  assert.equal(proofs.count, proofsBefore, "nothing was proved for any refused challenge");
});
