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




void (null as unknown as GloamAgent);

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
