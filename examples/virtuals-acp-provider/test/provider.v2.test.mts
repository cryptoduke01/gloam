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
import { ACP_STATUS, FakeAcp, FakeSession, PROVIDER, fakeWallet, funded, providerFor, rejected, requirementEntry } from "./fakes.mts";

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
  const { p, s } = await owedJob("3", async (_c, _t, raw) => {
    refunds.push(raw);
    await new Promise((r) => setTimeout(r, 200)); // the transfer is out; its answer takes a moment
    return `0x${String(refunds.length).padStart(64, "0")}`;
  });
  const ended = p.onEntry(s, rejected("3"));
  await new Promise((r) => setTimeout(r, 50));
  await Promise.all([ended, p.retryRefunds()]);
  assert.deepEqual(refunds, [10_000_000n]);
  assert.equal(p.status(84532, "3")?.refundedRaw, "10000000");
});

test("a refund that went out and then threw is found on chain and not sent again", async () => {
  let acpRef: FakeAcp | null = null;
  const refunds: bigint[] = [];
  const { p, s, acp } = await owedJob("4", async (to, _t, raw) => {
    refunds.push(raw);
    acpRef!.sent(PROVIDER, to, raw); // the transfer lands
    throw new Error("HTTP request failed. Status: 429 (waiting for the user operation)");
  });
  acpRef = acp;
  await p.onEntry(s, rejected("4"));
  await p.retryRefunds();
  await p.retryRefunds();
  assert.deepEqual(refunds, [10_000_000n], "sent once");
  assert.equal(p.status(84532, "4")?.refundedRaw, "10000000");
  assert.equal(p.status(84532, "4")?.refundOwed, "0");
  assert.ok(p.status(84532, "4")?.refundTx, "the refund found on chain is recorded");
});

test("a refund that threw with nothing on chain is sent again only an hour on", async () => {
  const refunds: bigint[] = [];
  let fail = true;
  const { p, s } = await owedJob("5", async (_c, _t, raw) => {
    refunds.push(raw);
    if (fail) throw new Error("The ACP wallet did not answer in time.");
    return `0x${"5".repeat(64)}`;
  });
  try {
    await p.onEntry(s, rejected("5"));
    await p.retryRefunds();
    assert.equal(refunds.length, 1, "not sent again while it may still land");
    fail = false;
    Date.now = () => realNow() + 61 * 60_000;
    await p.retryRefunds();
    assert.equal(refunds.length, 2, "an hour on with nothing on chain: sent again");
    assert.equal(p.status(84532, "5")?.refundOwed, "0");
  } finally {
    Date.now = realNow;
  }
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
  const p = providerFor(f.wallet, { refund: async (_c, _t, raw) => (refunds.push(raw), `0x${"7".repeat(64)}`) });
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
  const p = providerFor(f.wallet, { refund: async (_c, _t, raw) => (refunds.push(raw), `0x${"c".repeat(64)}`) });
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
