/**
 * Refunds the owner settles, refunds pinned on chain before they are sent (an
 * EOA nonce, or a user operation's sender and nonce), a payout that waited
 * behind a refund round, and a refund callback that never answers, against the
 * fakes. Each test asserts the safe outcome.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateReceiveKey, BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
import { pad, toHex, type Hex } from "viem";
import { ACP_STATUS, CLIENT, PROVIDER, FakeAcp, FakeSession, fakeWallet, funded, providerFor, rejected, requirementEntry } from "./fakes.mts";

const ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER = "0x00000000000000000000000000000000000000b7";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOST = "Timed out while waiting for call bundle to be confirmed.";

const realNow = Date.now.bind(Date);
afterEach(() => {
  Date.now = realNow;
});
const later = (ms: number) => {
  Date.now = () => realNow() + ms;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const within = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what}: still waiting after ${ms} ms`)), ms))]);
const toClient = (acp: FakeAcp) => acp.transfers.filter((t) => t.to.toLowerCase() === CLIENT.toLowerCase()).reduce((s, t) => s + t.value, 0n);
const noNote = async () => ({ status: "error", message: "No single private note holds 7 USDC" });

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

test("Q5: resolveRefund does not take a transaction recorded for another job's refund, even before it is counted", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  let n = 0;
  const tB = `0x${"b".repeat(64)}` as Hex;
  const p = providerFor(f.wallet, {
    refund: async () => {
      n++;
      if (n === 1) throw new Error(LOST); // job 80: lost, no hash
      return tB; // job 81: a hash comes back, its receipt not readable yet
    },
  });
  await stuckThenRejected(p, acp, "80", r1.tag);
  await stuckThenRejected(p, acp, "81", r1.tag);
  // Job 81's transaction lands before the next round counts it.
  acp.transfers.push({ from: PROVIDER, to: CLIENT, value: 7_000_000n, transactionHash: tB });
  const addr = (a: string) => pad(a as Hex, { size: 32 });
  acp.receipts.set(tB, { logs: [{ address: BASE_SEPOLIA_USDC, topics: [TRANSFER_TOPIC, addr(PROVIDER), addr(CLIENT)], data: toHex(7_000_000n, { size: 32 }) }] });
  // The owner sees a 7 transfer to this client in the wallet's history and hands it in for job 80.
  await assert.rejects(p.resolveRefund(84532, "80", { tx: tB }), /job 81/);
  await p.retryRefunds();
  assert.equal(p.status(84532, "81")!.refundOwed, "0", "job 81 counts its own refund");
  assert.equal(p.status(84532, "80")!.refundOwed, "7", "job 80 is still owed: one transfer never settles two refunds");
  assert.equal(toClient(acp), 7_000_000n);
});

test("Q6: an EOA refund dropped from the mempool, whose nonce the owner's own refund used, is settled with the owner's transaction", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  const dropped = `0x${"d".repeat(64)}` as Hex;
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async () => {
      calls++;
      acp.txs.set(dropped, { from: PROVIDER, nonce: 5, blockNumber: null }); // broadcast with nonce 5, pending
      acp.nonces.set(PROVIDER.toLowerCase(), 5);
      return dropped;
    },
  });
  await stuckThenRejected(p, acp, "82", r1.tag);
  acp.txs.delete(dropped); // dropped from the mempool: no receipt, ever
  acp.head = 105n;
  const manual = acp.sentWithNonce(PROVIDER, CLIENT, 7_000_000n, 5); // the owner sends the refund by hand, with nonce 5
  later(61 * 60_000);
  await p.retryRefunds();
  const held = p.refundsNeedingOwner().find((r) => r.jobId === "82");
  assert.ok(held, "held for the owner");
  assert.match(held!.why, /can no longer land/);
  // "Not sent" is refused: a transfer of this amount to the client went out since, and it may be the refund.
  await assert.rejects(p.resolveRefund(84532, "82", { notSent: true }), new RegExp(manual));
  const j = await p.resolveRefund(84532, "82", { tx: manual });
  assert.equal(j.refundOwed, "0", "the owner's refund is recorded");
  assert.equal(calls, 1, "never sent again");
  assert.equal(toClient(acp), 7_000_000n);
  assert.deepEqual(p.refundsNeedingOwner(), []);
});

test("Q6: an EOA refund whose nonce another transaction used (no transfer to the client) can be marked not sent, and goes out once", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  const dropped = `0x${"d".repeat(64)}` as Hex;
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      calls++;
      if (calls === 1) {
        acp.txs.set(dropped, { from: PROVIDER, nonce: 5, blockNumber: null });
        return dropped;
      }
      return acp.sent(PROVIDER, to, raw);
    },
  });
  await stuckThenRejected(p, acp, "83", r1.tag);
  acp.txs.delete(dropped);
  acp.nonces.set(PROVIDER.toLowerCase(), 6); // another transaction used nonce 5; it moved nothing to the client
  const j = await p.resolveRefund(84532, "83", { notSent: true });
  assert.equal(calls, 2, "sent again once the first can never land");
  assert.equal(j.refundOwed, "0");
  assert.equal(toClient(acp), 7_000_000n);
});

test("Q6: an EOA refund whose nonce nothing used yet is never marked not sent (it can still be broadcast again and land)", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  const dropped = `0x${"d".repeat(64)}` as Hex;
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async () => {
      calls++;
      acp.txs.set(dropped, { from: PROVIDER, nonce: 5, blockNumber: null });
      acp.nonces.set(PROVIDER.toLowerCase(), 5);
      return dropped;
    },
  });
  await stuckThenRejected(p, acp, "84", r1.tag);
  acp.txs.delete(dropped);
  later(61 * 60_000);
  await p.retryRefunds();
  await assert.rejects(p.resolveRefund(84532, "84", { notSent: true }), /may still land/);
  await assert.rejects(p.resolveRefund(84532, "84", { tx: acp.sent(PROVIDER, CLIENT, 7_000_000n) }), /only that transaction/);
  assert.equal(p.status(84532, "84")!.refundOwed, "7");
  assert.equal(calls, 1);
});

test("Q6: a 4337 bundle hash says nothing about the provider's nonce: a dropped bundle is never marked not sent", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  const bundle = `0x${"9".repeat(64)}` as Hex;
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async () => {
      calls++;
      acp.txs.set(bundle, { from: BUNDLER, nonce: 9, blockNumber: null }); // the bundler's transaction, not the provider's
      return bundle;
    },
  });
  await stuckThenRejected(p, acp, "85", r1.tag);
  acp.txs.delete(bundle);
  acp.nonces.set(BUNDLER, 10); // the bundler moved on; the user operation may be bundled again
  later(61 * 60_000);
  await p.retryRefunds();
  await assert.rejects(p.resolveRefund(84532, "85", { notSent: true }), /may still land/);
  assert.equal(p.status(84532, "85")!.refundOwed, "7");
  assert.equal(calls, 1);
});

const OP_NONCE = (0xabcdefn << 64n) | 0n; // nonce key 0xabcdef, sequence 0

test("R2: a refund user operation pinned before it is sent, whose answer was lost, is counted from the EntryPoint once it ran", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw, ctx) => {
      calls++;
      ctx?.sending({ userOp: { entryPoint: ENTRYPOINT, sender: PROVIDER, nonce: OP_NONCE } });
      acp.head = 101n;
      acp.ranUserOp(PROVIDER, OP_NONCE, true, { to, value: raw }); // it ran and moved the refund
      throw new Error(LOST);
    },
  });
  await stuckThenRejected(p, acp, "86", r1.tag);
  await p.retryRefunds();
  const j = p.status(84532, "86")!;
  assert.equal(j.refundOwed, "0", "counted from the EntryPoint, without the owner");
  assert.equal(calls, 1);
  assert.equal(toClient(acp), 7_000_000n);
  assert.deepEqual(p.refundsNeedingOwner(), []);
});

test("R2: a pinned refund user operation that ran and reverted moved nothing, so it is sent again, once", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw, ctx) => {
      calls++;
      if (calls === 1) {
        ctx?.sending({ userOp: { entryPoint: ENTRYPOINT, sender: PROVIDER, nonce: OP_NONCE } });
        acp.ranUserOp(PROVIDER, OP_NONCE, false);
        throw new Error(LOST);
      }
      return acp.sent(PROVIDER, to, raw);
    },
  });
  await stuckThenRejected(p, acp, "87", r1.tag);
  await p.retryRefunds();
  assert.equal(calls, 2);
  assert.equal(p.status(84532, "87")!.refundOwed, "0");
  assert.equal(toClient(acp), 7_000_000n);
});

test("R2: a pinned refund user operation that has not run is held (never marked not sent), and counted once it runs", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  const f = fakeWallet(pk, acp, { pay: noNote });
  let calls = 0;
  const p = providerFor(f.wallet, {
    refund: async (_to, _t, _raw, ctx) => {
      calls++;
      ctx?.sending({ userOp: { entryPoint: ENTRYPOINT, sender: PROVIDER, nonce: OP_NONCE } });
      throw new Error(LOST);
    },
  });
  await stuckThenRejected(p, acp, "88", r1.tag);
  later(61 * 60_000);
  await p.retryRefunds();
  assert.equal(p.status(84532, "88")!.refundOwed, "7");
  assert.ok(p.refundsNeedingOwner().some((r) => r.jobId === "88"), "after an hour the owner is told");
  await assert.rejects(p.resolveRefund(84532, "88", { notSent: true }), /has not run yet/);
  acp.head = 120n;
  acp.ranUserOp(PROVIDER, OP_NONCE, true, { to: CLIENT, value: 7_000_000n }); // the bundler includes it after all
  await p.retryRefunds();
  assert.equal(p.status(84532, "88")!.refundOwed, "0");
  assert.equal(calls, 1);
  assert.equal(toClient(acp), 7_000_000n);
});

test("a payout that waited behind a refund round re-reads the job and does not start too close to its expiry", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  let small = 0;
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      if (a.amount === "7") return noNote();
      small++;
      w.notes.push({ handle: `n-${small}`, label: a.label ?? "", origin: "payment", status: "spent", createdTx: `0x${String(small).padStart(64, "0")}` });
      return { status: "done", payment: `n-${small}`, hash: `0x${String(small).padStart(64, "0")}` };
    },
  });
  let entered = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const p = providerFor(f.wallet, {
    refund: async (to, _t, raw) => {
      entered = true;
      await gate;
      return acp.sent(PROVIDER, to, raw);
    },
  });
  const sA = new FakeSession("60", acp);
  await p.onEntry(sA, requirementEntry("60", { payouts: [{ to: r1.tag, amount: "7" }] }));
  sA.fund();
  await p.onEntry(sA, funded("60"));
  const sB = new FakeSession("61", acp);
  await p.onEntry(sB, requirementEntry("61", { payouts: [{ to: r1.tag, amount: "2" }] }));
  sB.fund();
  acp.set("60", { status: ACP_STATUS.rejected });
  sA.status = "rejected";
  const aDone = p.onEntry(sA, rejected("60"));
  while (!entered) await sleep(2);
  const bDone = p.onEntry(sB, funded("61")); // an hour left when it arrives; it reads the job, then waits behind the refund
  await sleep(30);
  later(55 * 60_000); // the refund round took 55 minutes: 5 minutes left on job 61
  release();
  await within(Promise.all([aDone, bDone]), 3000, "the two events");
  assert.equal(small, 0, "no payout started with 5 minutes left");
  assert.notEqual(p.status(84532, "61")!.state, "submitted");
  assert.match(p.status(84532, "61")!.blocked ?? "", /expiry/);
});

test("a refund callback that never answers does not hold up the provider; its late answer is recorded and counted once", async () => {
  const pk = await generateReceiveKey();
  const r1 = await generateReceiveKey();
  const acp = new FakeAcp();
  let small = 0;
  const f = fakeWallet(pk, acp, {
    pay: async (a, _n, w) => {
      if (a.amount === "7") return noNote();
      small++;
      w.notes.push({ handle: `n-${small}`, label: a.label ?? "", origin: "payment", status: "spent", createdTx: `0x${String(small).padStart(64, "0")}` });
      return { status: "done", payment: `n-${small}`, hash: `0x${String(small).padStart(64, "0")}` };
    },
  });
  let calls = 0;
  let answer!: (tx: string) => void;
  const p = providerFor(f.wallet, {
    refundTimeoutMs: 50,
    refund: () => {
      calls++;
      return new Promise<string>((r) => (answer = r));
    },
  });
  await within(stuckThenRejected(p, acp, "70", r1.tag), 2000, "the rejected job's refund round");
  const j = p.status(84532, "70")!;
  assert.equal(j.refundOwed, "7");
  assert.ok(j.refundPending?.lost, "an answer that did not come in time is a lost answer");
  // Other jobs carry on meanwhile.
  const sB = new FakeSession("71", acp);
  await within(p.onEntry(sB, requirementEntry("71", { payouts: [{ to: r1.tag, amount: "2" }] })), 2000, "a quote");
  sB.fund();
  await within(p.onEntry(sB, funded("71")), 2000, "a payout");
  assert.equal(p.status(84532, "71")!.state, "submitted");
  // While the call may still answer, nobody can say it was not sent.
  await assert.rejects(p.resolveRefund(84532, "70", { notSent: true }), /still running/);
  answer(acp.sent(PROVIDER, CLIENT, 7_000_000n));
  await sleep(5);
  await within(p.retryRefunds(), 2000, "a later round");
  assert.equal(p.status(84532, "70")!.refundOwed, "0");
  assert.equal(calls, 1);
  assert.equal(toClient(acp), 7_000_000n);
});
