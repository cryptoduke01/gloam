/**
 * The provider's money rules, against fakes: a payout whose answer was lost is
 * never sent twice, refunds count only what left the float, jobs with no
 * evaluator are refused, the job is read on chain before paying, errors that
 * reach the job room are short, and the earnings sweep leaves what is owed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_SEPOLIA_USDC, generateReceiveKey } from "@gloamtrade/sdk";
import { EarningsSweeper } from "../src/earnings.ts";
import { NO_EVALUATOR } from "../src/acp.ts";
import { OFFERING_NAME, RequirementError, parseRequirement } from "../src/offering.ts";
import { ACP_STATUS, CLIENT, FakeAcp, FakeSession, completed, fakeWallet, funded, providerFor, rejected, requirementEntry } from "./fakes.mts";

const BAD_TAG = "gloamr1." + Buffer.from("3059301306072a8648ce3d020106082a8648ce3d03010703420004" + "01".repeat(64), "hex").toString("base64url");
const TRUSTED_EVALUATOR = "0x00000000000000000000000000000000000000e1";

test("a payout whose answer was lost is never sent again, and nothing is submitted", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  // The engine says the payment may have gone out; its note is kept pending.
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      w.notes.push({ handle: "n-1", label: a.label ?? "", origin: "payment", status: "pending", createdTx: null });
      return { status: "unconfirmed", message: "The payment was sent, but its answer was lost (relay timeout).", check: "Refresh the balance before trying again." };
    },
  });
  const p = providerFor(f.wallet);
  const s = new FakeSession("1", acp);
  await p.onEntry(s, requirementEntry("1", { payouts: [{ to: r1.tag, amount: "7" }] }));
  s.fund();
  await p.onEntry(s, funded("1"));
  assert.equal(f.calls(), 1, "pay() is called once for one payout");
  assert.equal(s.submitted, null);
  assert.equal(p.status(84532, "1")?.state, "unconfirmed");
  assert.equal(p.status(84532, "1")?.results[0]?.status, "unconfirmed");
  // A replayed funded event (a restart) does not pay it again either.
  await p.onEntry(s, funded("1"));
  assert.equal(f.calls(), 1);
  // Once the chain shows it landed, the job carries on and submits.
  f.notes[0]!.status = "spent";
  f.notes[0]!.createdTx = `0x${"7".repeat(64)}`;
  await p.resume(s);
  assert.equal(f.calls(), 1, "still paid once");
  assert.ok(s.submitted, "submitted once the payout settled");
  assert.equal(p.status(84532, "1")?.results[0]?.status, "paid");
});

test("the journal records a payout before pay() is called", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  let seen: string | undefined;
  let p!: ReturnType<typeof providerFor>;
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      seen = p.status(84532, "2")?.results[0]?.status;
      w.notes.push({ handle: "n-1", label: a.label ?? "", origin: "payment", status: "spent", createdTx: `0x${"1".repeat(64)}` });
      return { status: "done", payment: "n-1", hash: `0x${"1".repeat(64)}` };
    },
  });
  p = providerFor(f.wallet);
  const s = new FakeSession("2", acp);
  await p.onEntry(s, requirementEntry("2", { payouts: [{ to: r1.tag, amount: "3" }] }));
  s.fund();
  await p.onEntry(s, funded("2"));
  assert.equal(seen, "sending", "the intent is on disk while pay() runs");
  assert.equal(p.status(84532, "2")?.state, "submitted");
});

test("pay() throws after the money moved: a restart finds the payment instead of paying again, and a reject refunds nothing that was paid", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const refunds: bigint[] = [];
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      w.notes.push({ handle: "n-9", label: a.label ?? "", origin: "payment", status: "spent", createdTx: `0x${"9".repeat(64)}` });
      throw new Error("DataError Invalid keyData (thrown after the transfer settled)");
    },
  });
  const p = providerFor(f.wallet, { refund: async (_c, _t, raw) => (refunds.push(raw), "0xrefund") });
  const s = new FakeSession("3", acp);
  await p.onEntry(s, requirementEntry("3", { payouts: [{ to: r1.tag, amount: "7" }] }));
  s.fund();
  await p.onEntry(s, funded("3")).catch(() => undefined);
  await p.onEntry(s, funded("3")).catch(() => undefined);
  assert.equal(f.calls(), 1, "the payout that landed is not sent again");
  assert.equal(p.status(84532, "3")?.results[0]?.status, "paid", "found by its label in the note store");
  // The client rejects anyway (it is its own evaluator).
  acp.set("3", { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, rejected("3"));
  assert.deepEqual(refunds, [], "7 left the float: nothing of it is refunded");
});

test("a reject while a payout is unconfirmed refunds only what never left, and the rest once it settles", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const r2 = await generateReceiveKey();
  const acp = new FakeAcp();
  const refunds: bigint[] = [];
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      w.notes.push({ handle: "n-1", label: a.label ?? "", origin: "payment", status: "pending", createdTx: null });
      return { status: "unconfirmed", message: "lost answer", check: "Refresh." };
    },
  });
  const p = providerFor(f.wallet, { refund: async (_c, _t, raw) => (refunds.push(raw), `0xrefund${refunds.length}`) });
  const s = new FakeSession("4", acp);
  await p.onEntry(s, requirementEntry("4", { payouts: [{ to: r1.tag, amount: "3" }, { to: r2.tag, amount: "4" }] }));
  s.fund();
  await p.onEntry(s, funded("4"));
  acp.set("4", { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, rejected("4"));
  assert.deepEqual(refunds, [4_000_000n], "the 4 never sent goes back; the 3 that may have gone out is held");
  assert.equal(p.status(84532, "4")?.refundHeldRaw, "3000000");
  // The unconfirmed payout turns out never to have landed (its note is gone): its 3 goes back too.
  f.notes.length = 0;
  await p.retryRefunds();
  assert.deepEqual(refunds, [4_000_000n, 3_000_000n]);
  assert.equal(p.status(84532, "4")?.refundOwed, "0");
});

test("a job with no evaluator is refused in every mode, before the requirement is read", async () => {
  const pk = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const jobs: [string, string | undefined, { trustedClients?: string[] }][] = [
    ["5", undefined, {}],
    ["6", NO_EVALUATOR, { trustedClients: [CLIENT] }],
  ];
  for (const [id, hook, extra] of jobs) {
    const p = providerFor(f.wallet, extra);
    const s = new FakeSession(id, acp, NO_EVALUATOR, OFFERING_NAME, hook);
    await p.onEntry(s, requirementEntry(id, "not even JSON"));
    assert.match(String(s.rejected), /evaluator/, `job ${id}`);
    assert.equal(s.budget, null);
  }
  // A trusted client's escrow job with an evaluator the owner trusts is taken.
  const ok = new FakeSession("7", acp, TRUSTED_EVALUATOR, OFFERING_NAME, NO_EVALUATOR);
  await providerFor(f.wallet, { trustedClients: [CLIENT], trustedEvaluators: [TRUSTED_EVALUATOR] }).onEntry(ok, requirementEntry("7", { payouts: [{ to: (await generateReceiveKey()).tag, amount: "1" }] }));
  assert.equal(ok.rejected, null);
  assert.ok(ok.budget);
});

test("a job is paid only when the contract says it is funded, for this provider, with the quoted hook, budget and evaluator, and time left", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const cases: [string, (acp: FakeAcp, id: string) => void][] = [
    ["not funded on chain (the event alone)", () => undefined],
    ["another provider", (acp, id) => (acp.fund(id), acp.set(id, { provider: "0x00000000000000000000000000000000000000bb" }))],
    ["another hook", (acp, id) => (acp.fund(id), acp.set(id, { hook: NO_EVALUATOR }))],
    ["a smaller budget", (acp, id) => (acp.fund(id), acp.set(id, { budget: 1n }))],
    ["about to expire", (acp, id) => (acp.fund(id), acp.set(id, { expiredAt: BigInt(Math.floor(Date.now() / 1000) + 60) }))],
    ["no evaluator", (acp, id) => (acp.fund(id), acp.set(id, { evaluator: NO_EVALUATOR }))],
    ["another client", (acp, id) => (acp.fund(id), acp.set(id, { client: "0x00000000000000000000000000000000000000c2" }))],
  ];
  let n = 20;
  for (const [what, onChain] of cases) {
    const acp = new FakeAcp();
    const f = fakeWallet(pk, acp);
    const p = providerFor(f.wallet);
    const id = String(n++);
    const s = new FakeSession(id, acp);
    await p.onEntry(s, requirementEntry(id, { payouts: [{ to: r1.tag, amount: "2" }] }));
    onChain(acp, id);
    s.status = "funded";
    await p.onEntry(s, funded(id));
    assert.equal(f.paid.length, 0, `not paid: ${what}`);
    assert.equal(s.submitted, null, what);
  }
  // Funded on chain as quoted: paid.
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  const s = new FakeSession("30", acp);
  await p.onEntry(s, requirementEntry("30", { payouts: [{ to: r1.tag, amount: "2" }] }));
  s.fund();
  await p.onEntry(s, funded("30"));
  assert.equal(f.paid.length, 1);
  assert.ok(acp.reads > 0, "the job was read on chain");
});

test("an error that reaches the job room is one short line, never the RPC URL", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, {
    pay: async () => {
      throw Object.assign(new Error("HTTP request failed.\n\nURL: https://base-sepolia.g.alchemy.com/v2/SECRET_KEY_123456789\nRequest body: {\"method\":\"eth_sendRawTransaction\"}\n\nVersion: viem@2.55.2"), {
        shortMessage: "HTTP request failed.",
      });
    },
  });
  const p = providerFor(f.wallet);
  const s = new FakeSession("40", acp);
  await p.onEntry(s, requirementEntry("40", { payouts: [{ to: r1.tag, amount: "2" }] }));
  s.fund();
  await p.onEntry(s, funded("40")).catch(() => undefined);
  const room = s.messages.join("\n");
  assert.match(room, /HTTP request failed/);
  assert.ok(!/SECRET_KEY|alchemy|Request body|Version: viem/.test(room), room);
  assert.ok(!/SECRET_KEY/.test(JSON.stringify(p.status(84532, "40"))), "nor in the journal");
});

test("the earnings sweep leaves principal still owed to clients, and retries a refund that failed", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  // 30 in the provider's public wallet: 8 of it is a rejected job's principal, not yet refunded.
  const f = fakeWallet(pk, acp, { publicBalance: 30_000_000n, pay: async () => ({ status: "error", message: "rpc down" }) });
  let refundWorks = false;
  const refunds: bigint[] = [];
  const sweeper = new EarningsSweeper({ wallet: f.wallet, tokens: [BASE_SEPOLIA_USDC], minBatch: "5", roundTo: "5" });
  const p = providerFor(f.wallet, {
    earnings: sweeper,
    refund: async (_c, _t, raw) => {
      if (!refundWorks) throw new Error("insufficient balance");
      refunds.push(raw);
      return "0xrefund";
    },
  });
  const s = new FakeSession("50", acp);
  await p.onEntry(s, requirementEntry("50", { payouts: [{ to: r1.tag, amount: "8" }] }));
  s.fund();
  await p.onEntry(s, funded("50"));
  acp.set("50", { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, rejected("50"));
  assert.equal(p.status(84532, "50")?.refundOwed, "8", "the refund failed and is owed");
  assert.equal(p.publicReserve(BASE_SEPOLIA_USDC), 8_000_000n);
  // Another job completes: the sweep adds only what is not owed (30 - 8 = 22, in fives: 20).
  const other = await sweeper.sweep({ reserve: (t) => p.publicReserve(t) });
  assert.deepEqual(f.adds, ["20"], JSON.stringify(other));
  // The provider retries the refund before it sweeps.
  refundWorks = true;
  const s2 = new FakeSession("51", acp);
  await p.onEntry(s2, completed("51"));
  assert.deepEqual(refunds, [8_000_000n]);
  assert.equal(p.status(84532, "50")?.refundOwed, "0");
});

test("Gloam addresses that are not P-256 keys are refused in a requirement, before any quote", async () => {
  const provider = await generateReceiveKey();
  const open = async () => "";
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: BAD_TAG, amount: "1" }] }), open), RequirementError);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: provider.tag, amount: "1" }], replyTo: BAD_TAG }), open), RequirementError);
});
