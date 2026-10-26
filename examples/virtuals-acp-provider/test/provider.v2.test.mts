/**
 * The provider's second round of money rules, against fakes: one quote per
 * job and payouts bounded by what the funding moved; refunds written down
 * before they are sent, found on chain when their answer is lost, and never
 * sent by two rounds at once; a stale unconfirmed payout cancelled so its
 * principal can go back; a funding lookup that fails asked again; a blocked
 * job's principal kept reserved; a job on another chain refused.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReceiveKey } from "@gloamtrade/sdk";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import type { AssetTokenLike } from "../src/acp.ts";
import { ACP_STATUS, CLIENT, FakeAcp, FakeSession, PROVIDER, fakeWallet, funded, providerFor, rejected, requirementEntry } from "./fakes.mts";

const realNow = Date.now.bind(Date);






test("one quote per job: a second requirement does not replace the list the client funded", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  class RacingSession extends FakeSession {
    n = 0;
    override async setBudgetWithFundRequest(a: AssetTokenLike, t: AssetTokenLike, d: string) {
      this.n++;
      if (this.n === 1) return super.setBudgetWithFundRequest(a, t, d);
      throw new Error("setBudget reverted: the job is not Open (the client funded first)");
    }
  }
  const s = new RacingSession("1", acp);
  await p.onEntry(s, requirementEntry("1", { payouts: [{ to: r1.tag, amount: "0.01" }] }));
  s.status = "open"; // the session has not seen budget.set yet
  await p.onEntry(s, requirementEntry("1", { payouts: [{ to: r1.tag, amount: "10" }] }));
  assert.equal(s.n, 1, "no second quote");
  s.fund();
  await p.onEntry(s, funded("1"));
  assert.deepEqual(f.paid.map((x) => x.amount), ["0.01"], "only the list that was quoted and funded is paid");
});

test("payouts are bounded by what the client's funding moved to the provider, read from the funding transaction", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  const s = new FakeSession("2", acp);
  await p.onEntry(s, requirementEntry("2", { payouts: [{ to: r1.tag, amount: "5" }] }));
  acp.fund("2", 1_000_000n); // the funding moved 1, not 5
  s.status = "funded";
  await p.onEntry(s, funded("2"));
  assert.equal(f.paid.length, 0);
  assert.match(String(p.status(84532, "2")?.blocked), /less than/);
  assert.equal(p.status(84532, "2")?.receivedRaw, "1000000");
});

/** A job whose one payout failed for good, then rejected: its whole principal is owed back. */
async function owedJob(id: string, refund: (to: string, token: string, raw: bigint) => Promise<string>) {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: async () => ({ status: "error", message: "rpc down" }) });
  const p = providerFor(f.wallet, { refund: refund as never });
  const s = new FakeSession(id, acp);
  await p.onEntry(s, requirementEntry(id, { payouts: [{ to: r1.tag, amount: "10" }] }));
  s.fund();
  await p.onEntry(s, funded(id));
  acp.set(id, { status: ACP_STATUS.rejected });
  s.status = "rejected";
  return { p, s, acp, f };
}

test("two refund rounds at once send one refund", async () => {
  const refunds: bigint[] = [];
  let acpRef: FakeAcp | null = null;
  const { p, s, acp } = await owedJob("3", async (to, _t, raw) => {
    refunds.push(raw);
    await new Promise((r) => setTimeout(r, 200)); // the transfer is out; its answer takes a moment
    return acpRef!.sent(PROVIDER, to, raw);
  });
  acpRef = acp;
  const ended = p.onEntry(s, rejected("3"));
  await new Promise((r) => setTimeout(r, 50));
  await Promise.all([ended, p.retryRefunds()]);
  assert.deepEqual(refunds, [10_000_000n]);
  assert.equal(p.status(84532, "3")?.refundedRaw, "10000000");
});

test("a refund that went out and then threw is not sent again: it waits for the owner, who settles it with the transaction found on chain", async () => {
  let acpRef: FakeAcp | null = null;
  const refunds: bigint[] = [];
  let landed = "" as `0x${string}`;
  const { p, s, acp, f } = await owedJob("4", async (to, _t, raw) => {
    refunds.push(raw);
    landed = acpRef!.sent(PROVIDER, to, raw); // the transfer lands
    throw new Error("HTTP request failed. Status: 429 (waiting for the user operation)");
  });
  acpRef = acp;
  await p.onEntry(s, rejected("4"));
  await p.retryRefunds();
  try {
    Date.now = () => realNow() + 2 * 60 * 60_000;
    await p.retryRefunds();
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(refunds, [10_000_000n], "sent once");
  assert.equal(p.status(84532, "4")?.refundedRaw, "0", "not counted from a guess");
  assert.equal(p.publicReserve(f.wallet.network.assets[0]!.address), 10_000_000n, "held meanwhile");
  assert.equal(p.refundsNeedingOwner().length, 1);
  // A transfer that is not this refund is refused; the real one is counted.
  await assert.rejects(p.resolveRefund(84532, "4", { tx: acp.sent(PROVIDER, CLIENT, 1n) }), /does not show/);
  const after = await p.resolveRefund(84532, "4", { tx: landed });
  assert.equal(after.refundedRaw, "10000000");
  assert.equal(after.refundOwed, "0");
  assert.equal(p.refundsNeedingOwner().length, 0);
  assert.deepEqual(refunds, [10_000_000n]);
});

test("a refund that threw with nothing on chain is not sent again on its own, even an hour on; once the owner says it never went out, it is sent", async () => {
  const refunds: bigint[] = [];
  let fail = true;
  let acpRef: FakeAcp | null = null;
  const { p, s, acp } = await owedJob("5", async (to, _t, raw) => {
    refunds.push(raw);
    if (fail) throw new Error("The ACP wallet did not answer in time.");
    return acpRef!.sent(PROVIDER, to, raw);
  });
  acpRef = acp;
  try {
    await p.onEntry(s, rejected("5"));
    await p.retryRefunds();
    Date.now = () => realNow() + 61 * 60_000;
    await p.retryRefunds();
    assert.equal(refunds.length, 1, "not sent again while it may still land");
  } finally {
    Date.now = realNow;
  }
  fail = false;
  await p.resolveRefund(84532, "5", { notSent: true });
  assert.equal(refunds.length, 2, "sent once the owner says the first never went out");
  assert.equal(p.status(84532, "5")?.refundOwed, "0");
});

test("a payout left unconfirmed for an hour is cancelled on chain, so its principal goes back", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const refunds: bigint[] = [];
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      w.notes.push({ handle: "n-1", label: a.label ?? "", origin: "payment", status: "pending", createdTx: null });
      return { status: "unconfirmed", message: "lost answer", check: "Refresh." };
    },
  });
  const p = providerFor(f.wallet, { refund: async (to, _t, raw) => (refunds.push(raw), acp.sent(PROVIDER, to, raw)) });
  const s = new FakeSession("6", acp);
  await p.onEntry(s, requirementEntry("6", { payouts: [{ to: r1.tag, amount: "7" }] }));
  s.fund();
  await p.onEntry(s, funded("6"));
  acp.set("6", { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, rejected("6"));
  assert.deepEqual(refunds, [], "held while it may land");
  // An hour on, the engine marks it stale; the provider cancels it (spends its note back) and refunds.
  f.notes[0]!.stale = true;
  await p.retryRefunds();
  assert.deepEqual(f.cancelled, ["n-1"]);
  assert.deepEqual(refunds, [7_000_000n]);
  assert.equal(p.status(84532, "6")?.refundHeldRaw, "0");
});

test("a funding lookup that fails at job end is asked again, and the principal stays reserved meanwhile", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const refunds: bigint[] = [];
  const f = fakeWallet(pk, acp, { pay: async () => ({ status: "error", message: "rpc down" }) });
  const p = providerFor(f.wallet, { refund: async (to, _t, raw) => (refunds.push(raw), acp.sent(PROVIDER, to, raw)) });
  const s = new FakeSession("7", acp);
  await p.onEntry(s, requirementEntry("7", { payouts: [{ to: r1.tag, amount: "10" }] }));
  // The client funds and rejects at once; the provider's lookups of the funding fail.
  acp.fund("7");
  acp.set("7", { status: ACP_STATUS.rejected });
  acp.logsDown = true;
  s.status = "funded";
  await p.onEntry(s, funded("7"));
  s.status = "rejected";
  await p.onEntry(s, rejected("7"));
  const token = f.wallet.network.assets[0]!.address;
  assert.equal(p.publicReserve(token), 10_000_000n, "held while the chain cannot say");
  acp.logsDown = false;
  await p.retryRefunds();
  assert.deepEqual(refunds, [10_000_000n]);
  assert.equal(p.status(84532, "7")?.funded, true);
});

test("a job funded on chain but blocked from paying keeps its principal reserved after its expiry", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  const token = f.wallet.network.assets[0]!.address;
  const s = new FakeSession("8", acp);
  await p.onEntry(s, requirementEntry("8", { payouts: [{ to: r1.tag, amount: "6" }] }));
  s.fund();
  acp.set("8", { expiredAt: BigInt(Math.floor(Date.now() / 1000) + 60) });
  await p.onEntry(s, funded("8"));
  assert.match(String(p.status(84532, "8")?.blocked), /expiry/);
  assert.equal(p.status(84532, "8")?.funded, true, "funded on chain, even though blocked");
  try {
    Date.now = () => realNow() + 2 * 60 * 60_000; // its expiry passes before job.expired is handled
    assert.equal(p.publicReserve(token), 6_000_000n);
  } finally {
    Date.now = realNow;
  }
});

test("a job on a chain other than the provider's is refused", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const other = { ...(f.wallet as unknown as Record<string, unknown>), network: { ...f.wallet.network, chainId: 4663 } } as unknown as GloamAgent;
  const p = providerFor(other);
  const s = new FakeSession("9", acp);
  await p.onEntry(s, requirementEntry("9", { payouts: [{ to: r1.tag, amount: "1" }] }));
  assert.match(String(s.rejected), /chain/);
  assert.equal(s.budget, null);
});

test("a payout the engine answers without a hash is recorded without one, never as the text undefined", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      w.notes.push({ handle: "n-1", label: a.label ?? "", origin: "payment", status: "spent", createdTx: null });
      return { status: "done", alreadyPaid: true, payment: "n-1" };
    },
  });
  const p = providerFor(f.wallet);
  const s = new FakeSession("10", acp);
  await p.onEntry(s, requirementEntry("10", { payouts: [{ to: r1.tag, amount: "2" }] }));
  s.fund();
  await p.onEntry(s, funded("10"));
  const r = p.status(84532, "10")?.results[0];
  assert.equal(r?.status, "paid");
  assert.equal(r?.tx, undefined);
});

test("a quoted job past its expiry is settled from the chain on start: funded means its principal goes back, not funded frees its reserve", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const refunds: bigint[] = [];
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet, { refund: async (to, _t, raw) => (refunds.push(raw), acp.sent(PROVIDER, to, raw)) });
  const token = f.wallet.network.assets[0]!.address;
  const funded1 = new FakeSession("11", acp);
  await p.onEntry(funded1, requirementEntry("11", { payouts: [{ to: r1.tag, amount: "4" }] }));
  funded1.fund(); // funded on chain; the provider never heard
  const unfunded = new FakeSession("12", acp);
  await p.onEntry(unfunded, requirementEntry("12", { payouts: [{ to: r1.tag, amount: "3" }] }));
  try {
    Date.now = () => realNow() + 2 * 60 * 60_000;
    assert.equal(p.publicReserve(token), 7_000_000n, "both held until the chain says otherwise");
    await p.start();
    assert.equal(p.status(84532, "12")?.state, "expired");
    assert.equal(p.status(84532, "12")?.funded, false);
    assert.equal(p.status(84532, "11")?.funded, true);
    assert.deepEqual(refunds, [4_000_000n], "the funded one's principal goes back");
    assert.equal(p.publicReserve(token), 0n);
  } finally {
    Date.now = realNow;
  }
});

test("no quote when the chain's block number cannot be read, or when the ACP contract was upgraded; no payout after an upgrade", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  const req = { payouts: [{ to: r1.tag, amount: "2" }] };
  const realBlock = acp.getBlockNumber;
  acp.getBlockNumber = async () => {
    throw new Error("HTTP request failed. Status: 429");
  };
  const s1 = new FakeSession("13", acp);
  await p.onEntry(s1, requirementEntry("13", req));
  assert.match(String(s1.rejected), /chain/);
  assert.equal(s1.budget, null);
  acp.getBlockNumber = realBlock;
  acp.implementation = "0x00000000000000000000000000000000000000ee";
  const s2 = new FakeSession("14", acp);
  await p.onEntry(s2, requirementEntry("14", req));
  assert.match(String(s2.rejected), /upgraded|implementation/);
  assert.equal(s2.budget, null);
  // Quoted before an upgrade, funded after it: not paid.
  acp.implementation = "0xc4e95dbc7e8c99c114ff9c8299a3e4851e1530ff";
  const s3 = new FakeSession("15", acp);
  await p.onEntry(s3, requirementEntry("15", req));
  assert.ok(s3.budget);
  acp.implementation = "0x00000000000000000000000000000000000000ee";
  s3.fund();
  await p.onEntry(s3, funded("15"));
  assert.equal(f.paid.length, 0);
  assert.match(String(p.status(84532, "15")?.blocked), /upgraded|implementation/);
});
