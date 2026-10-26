/**
 * The provider's refund and reserve rules against a refund that never lands, a
 * refund whose answer is lost and that lands late, two jobs with equal refunds,
 * and a funded job whose job.funded event never arrived. Each test asserts the
 * safe outcome.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateReceiveKey, BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
import { EarningsSweeper } from "../src/earnings.ts";
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

const realNow = Date.now.bind(Date);
afterEach(() => {
  Date.now = realNow;
});
const later = (ms: number) => {
  Date.now = () => realNow() + ms;
};
const toClient = (acp: FakeAcp) => acp.transfers.filter((t) => t.to.toLowerCase() === CLIENT.toLowerCase()).reduce((s, t) => s + t.value, 0n);

/** A job of 7 whose only payout fails before anything is sent, then the client rejects it: 7 is owed back. */
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

test("a refund that was broadcast but never landed is not counted as refunded", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { failOn: 0, publicBalance: 7_000_000n });
  // The refund's user operation is handed to the bundler (a hash comes back) and is then dropped,
  // or lands with its inner transfer reverted. Nothing reaches the client.
  const p = providerFor(f.wallet, { refund: async () => `0x${"d".repeat(64)}` });
  await stuckThenRejected(p, acp, "20", r1.tag);
  const j = p.status(84532, "20")!;
  console.log(`  [R1] journal: refundedRaw=${j.refundedRaw} refundOwed=${j.refundOwed} reserve=${p.publicReserve(BASE_SEPOLIA_USDC)} client received=${toClient(acp)}`);
  // The earnings sweep then treats the client's principal as earnings.
  const sweep = await new EarningsSweeper({ wallet: f.wallet, tokens: [BASE_SEPOLIA_USDC], minBatch: "5", roundTo: "1" }).sweep({ reserve: (t) => p.publicReserve(t) });
  console.log(`  [R1] earnings sweep: ${JSON.stringify(sweep.results.map((r) => [r.status, r.added]))}, adds=${JSON.stringify(f.adds)}`);
  assert.equal(toClient(acp), 0n, "nothing reached the client");
  assert.equal(p.publicReserve(BASE_SEPOLIA_USDC), 7_000_000n, "the 7 stays reserved until the refund is seen on chain");
});

test("a refund whose answer was lost is never sent again on its own: when the first lands late the client is refunded once", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { failOn: 0 });
  let n = 0;
  // 1st: the user operation sits in the bundler's mempool, waitForCallsStatus gives up after 60 s.
  // 2nd: lands at once. acp-node-v2 signs each with a fresh random nonce key, so both are valid.
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      n++;
      if (n === 1) throw new Error("Timed out while waiting for call bundle with id 0xabc to be confirmed.");
      return acp.sent(PROVIDER, to, raw);
    },
  });
  await stuckThenRejected(p, acp, "21", r1.tag);
  assert.ok(p.status(84532, "21")?.refundPending, "pending after the lost answer");
  later(61 * 60_000);
  await p.retryRefunds();
  acp.sent(PROVIDER, CLIENT, 7_000_000n); // the first user operation is finally bundled
  await p.retryRefunds();
  console.log(`  [R2] refund calls=${n}; client received ${toClient(acp)} for 7000000 owed; journal refundedRaw=${p.status(84532, "21")?.refundedRaw}`);
  assert.equal(toClient(acp), 7_000_000n, "the client gets 7 back once");
});

test("two jobs of one client with equal refunds: a lost refund is not matched to the other job's transfer", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: async () => ({ status: "error", message: "No single private note holds 7 USDC" }) });
  let n = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      n++;
      // Job 30's refund is dropped by the bundler (answer lost, never lands); job 31's lands.
      if (n === 1) throw new Error("Timed out while waiting for call bundle to be confirmed.");
      return acp.sent(PROVIDER, to, raw);
    },
  });
  await stuckThenRejected(p, acp, "30", r1.tag);
  await stuckThenRejected(p, acp, "31", r1.tag);
  await p.retryRefunds(); // a later round (any job.completed runs one)
  const a = p.status(84532, "30")!;
  const b = p.status(84532, "31")!;
  console.log(`  [R3] job 30 refunded=${a.refundedRaw} txs=${JSON.stringify(a.refundTxs)}; job 31 refunded=${b.refundedRaw} txs=${JSON.stringify(b.refundTxs)}; client received ${toClient(acp)} of 14000000 owed`);
  assert.equal(toClient(acp) >= 14_000_000n || a.refundOwed !== "0", true, "either both refunds reached the client, or job 30 still shows 7 owed");
});

test("a fund-transfer job funded on chain whose job.funded event never arrived keeps its reserve past expiry", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { publicBalance: 7_000_000n });
  const p = providerFor(f.wallet);
  const s = new FakeSession("40", acp);
  await p.onEntry(s, requirementEntry("40", { payouts: [{ to: r1.tag, amount: "7" }] }));
  s.fund(); // on chain: funded, 7 moved to the provider. The provider is offline; the event is missed.
  const before = p.publicReserve(BASE_SEPOLIA_USDC);
  later(2 * 60 * 60_000); // past the job's expiry; nobody has called claimRefund yet
  const after = p.publicReserve(BASE_SEPOLIA_USDC);
  const sweep = await new EarningsSweeper({ wallet: f.wallet, tokens: [BASE_SEPOLIA_USDC], minBatch: "5", roundTo: "1" }).sweep({ reserve: (t) => p.publicReserve(t) });
  console.log(`  [R4] reserve before expiry=${before}, after=${after}; sweep adds=${JSON.stringify(f.adds)} (${sweep.status})`);
  assert.equal(after, 7_000_000n, "the funded principal stays reserved until the chain says the job was not funded");
});
