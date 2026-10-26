/**
 * The owner's refund path, quoted jobs settled from the chain while a refund
 * runs, and the ACP implementation gate, against the fakes. Each test asserts
 * the safe outcome.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateReceiveKey, BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
import type { Hex } from "viem";
import {
  ACP_STATUS,
  CLIENT,
  PROVIDER,
  FakeAcp,
  FakeSession,
  fakeWallet,
  funded,
  providerFor,
  rejected,
  requirementEntry,
} from "./fakes.mts";
import type { JobRoomEntry } from "../src/acp.ts";

const realNow = Date.now.bind(Date);
afterEach(() => {
  Date.now = realNow;
});
const later = (ms: number) => {
  Date.now = () => realNow() + ms;
};
const toClient = (acp: FakeAcp) => acp.transfers.filter((t) => t.to.toLowerCase() === CLIENT.toLowerCase()).reduce((s, t) => s + t.value, 0n);
const expired = (jobId: string): JobRoomEntry => ({ kind: "system", onChainJobId: jobId, chainId: 84532, event: { type: "job.expired", jobId }, timestamp: 0 });

async function stuckThenRejected(p: ReturnType<typeof providerFor>, acp: FakeAcp, jobId: string, to: string) {
  const s = new FakeSession(jobId, acp);
  await p.onEntry(s, requirementEntry(jobId, { payouts: [{ to, amount: "7" }] }));
  s.fund();
  await p.onEntry(s, funded(jobId));
  assert.equal(p.status(84532, jobId)?.state, "stuck");
  acp.set(jobId, { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, rejected(jobId));
  return s;
}

test("resolveRefund does not accept another job's refund transaction", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: async () => ({ status: "error", message: "No single private note holds 7 USDC" }) });
  let n = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      n++;
      if (n === 1) throw new Error("Timed out while waiting for call bundle to be confirmed.");
      return acp.sent(PROVIDER, to, raw);
    },
  });
  await stuckThenRejected(p, acp, "50", r1.tag); // lost answer: waits for the owner
  await stuckThenRejected(p, acp, "51", r1.tag); // lands
  const t51 = p.status(84532, "51")!.refundTxs![0]! as Hex;
  // The owner checks the wallet's history, sees a 7 transfer to this client and hands it in for job 50.
  let accepted = true;
  try {
    await p.resolveRefund(84532, "50", { tx: t51 });
  } catch (e) {
    accepted = false;
    console.log(`  [owner] refused: ${(e as Error).message}`);
  }
  const a = p.status(84532, "50")!;
  console.log(`  [owner] accepted=${accepted}; job 50 refunded=${a.refundedRaw} owed=${a.refundOwed} txs=${JSON.stringify(a.refundTxs)}; job 51 txs=${JSON.stringify(p.status(84532, "51")!.refundTxs)}; client received ${toClient(acp)} of 14000000`);
  assert.equal(accepted, false, "a transaction already counted for another job is refused");
});

test("resolveRefund({ notSent }) on a refund whose transaction was broadcast does not lead to a second refund", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { failOn: 0 });
  const held: Hex = `0x${"d".repeat(64)}`;
  let n = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      n++;
      return n === 1 ? held : acp.sent(PROVIDER, to, raw); // 1st: a hash comes back, the op sits in a mempool
    },
  });
  await stuckThenRejected(p, acp, "52", r1.tag);
  later(61 * 60_000);
  await p.retryRefunds();
  const w = p.refundsNeedingOwner();
  console.log(`  [owner] waiting for the owner: ${JSON.stringify(w)}`);
  let accepted = true;
  try {
    await p.resolveRefund(84532, "52", { notSent: true }); // the owner sees nothing on chain yet
  } catch (e) {
    accepted = false;
    console.log(`  [owner] refused: ${(e as Error).message}`);
  }
  acp.sent(PROVIDER, CLIENT, 7_000_000n); // the first operation is finally bundled
  await p.retryRefunds();
  console.log(`  [owner] notSent accepted=${accepted}; refund calls=${n}; client received ${toClient(acp)} for 7000000 owed`);
  assert.equal(toClient(acp), 7_000_000n, "the client gets 7 back once");
});

test("checkQuoted racing a job.expired refund does not wipe the refund and send it again", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { publicBalance: 7_000_000n });
  const p = providerFor(f.wallet, { refund: async (to, _t, raw) => acp.sent(PROVIDER, to, raw) });
  const s = new FakeSession("60", acp);
  await p.onEntry(s, requirementEntry("60", { payouts: [{ to: r1.tag, amount: "7" }] }));
  s.fund(); // funded on chain; the job.funded event is missed
  later(2 * 60 * 60_000); // past expiry
  // checkQuoted (from start() or another job's job.completed) reads the journal, then its funding lookup is slow.
  const realGetLogs = acp.getLogs;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  acp.getLogs = (async (q: never) => {
    if (first) {
      first = false;
      await gate;
    }
    return realGetLogs(q);
  }) as typeof acp.getLogs;
  const sweep = p.checkQuoted();
  await new Promise((r) => setTimeout(r, 20));
  // Meanwhile the client calls claimRefund: job.expired arrives and the provider refunds the principal.
  acp.set("60", { status: ACP_STATUS.expired });
  s.status = "expired";
  await p.onEntry(s, expired("60"));
  console.log(`  [quoted] after job.expired: refunded=${p.status(84532, "60")?.refundedRaw} client received ${toClient(acp)}`);
  release();
  await sweep;
  console.log(`  [quoted] after checkQuoted finished: refunded=${p.status(84532, "60")?.refundedRaw} txs=${JSON.stringify(p.status(84532, "60")?.refundTxs)}`);
  await p.retryRefunds();
  console.log(`  [quoted] after the next round: client received ${toClient(acp)} for 7000000 owed`);
  assert.equal(toClient(acp), 7_000_000n, "refunded once");
});

test("the impl gate refuses to quote and to pay when the proxy points elsewhere", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp);
  const p = providerFor(f.wallet);
  const s = new FakeSession("70", acp);
  await p.onEntry(s, requirementEntry("70", { payouts: [{ to: r1.tag, amount: "2" }] }));
  acp.implementation = "0x000000000000000000000000000000000000dead";
  s.fund();
  await p.onEntry(s, funded("70"));
  const s2 = new FakeSession("71", acp);
  await p.onEntry(s2, requirementEntry("71", { payouts: [{ to: r1.tag, amount: "2" }] }));
  console.log(`  [gate] job 70: ${p.status(84532, "70")?.blocked}; paid ${f.calls()}; job 71 rejected: ${s2.rejected}`);
  assert.equal(f.calls(), 0);
  assert.equal(s2.rejected, "acp upgraded");
  assert.equal(p.publicReserve(BASE_SEPOLIA_USDC) > 0n, true, "the blocked job's principal stays reserved");
});
