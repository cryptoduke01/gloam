import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_SEPOLIA_USDC, generateReceiveKey, openSealedTicket, type ReceiveKey } from "@gloamtrade/sdk";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import { assetToken, NO_EVALUATOR, type AssetTokenLike, type DerivedStatus, type JobRoomEntry, type JobSessionLike } from "../src/acp.ts";
import { OFFERING_NAME, PRIVATE_PAYOUT_OFFERING, RequirementError, buildPayoutRequirement, parseRequirement } from "../src/offering.ts";
import { DELIVERABLE_TYPE, PrivatePayoutProvider } from "../src/provider.ts";

const TOKEN = "0xECc22a8F6fD62388498fBa19813E214605a2BDb3" as const;

let keys: ReceiveKey[] = [];
async function key() {
  const k = await generateReceiveKey();
  keys.push(k);
  return k;
}

test("the offering is a plain ACP offering record", () => {
  assert.equal(PRIVATE_PAYOUT_OFFERING.name, OFFERING_NAME);
  assert.equal(PRIVATE_PAYOUT_OFFERING.requiredFunds, false);
  assert.ok(PRIVATE_PAYOUT_OFFERING.description.includes("public"));
});

test("requirements: plain or sealed to the provider; claim links need replyTo", async () => {
  const provider = await key();
  const r1 = await key();
  const client = await key();
  const open = (s: string) => openSealedTicket(s, provider);
  const plain = await parseRequirement(JSON.stringify({ payouts: [{ to: r1.tag, amount: "7" }] }), open);
  assert.equal(plain.payouts.length, 1);
  assert.equal(plain.sealed, false);

  const req = await buildPayoutRequirement({ payouts: [{ to: r1.tag, amount: "7", note: "march" }, { to: "claim-link", amount: "3" }], providerAddress: provider.tag, replyTo: client.tag });
  assert.ok(req.sealedPayouts?.startsWith("gloam2t."));
  assert.ok(!JSON.stringify(req).includes(r1.tag), "the sealed requirement does not name the recipient");
  const sealed = await parseRequirement(JSON.stringify(req), open);
  assert.equal(sealed.sealed, true);
  assert.deepEqual(sealed.payouts.map((p) => p.amount), ["7", "3"]);
  assert.equal(sealed.replyTo, client.tag);

  const other = await key();
  await assert.rejects(parseRequirement(JSON.stringify(req), (s) => openSealedTicket(s, other)), /not sealed to this provider/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: "claim-link", amount: "3" }] }), open), /needs replyTo/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: "0xabc", amount: "3" }] }), open), /Gloam address/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: r1.tag, amount: "0" }] }), open), /positive/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: r1.tag, amount: "1.0000001" }] }), open), /6 decimals/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: r1.tag, amount: "1" }], sealedPayouts: req.sealedPayouts }), open), /either/);
  await assert.rejects(parseRequirement(JSON.stringify({ payouts: [{ to: r1.tag, amount: "1" }], cc: "x" }), open), /Unknown/);
  await assert.rejects(parseRequirement("nope", open), RequirementError);
});

// ------------------------------------------------------------------ a provider against fakes

type Paid = { to: string; amount: string; note?: string; sealTo?: string };

function fakeWallet(provider: ReceiveKey, opts: { float?: bigint; failOn?: number } = {}) {
  const paid: Paid[] = [];
  const w = {
    network: { key: "base", chainId: 84532, label: "Base", testnet: true, assets: [{ symbol: "USDC", address: BASE_SEPOLIA_USDC, decimals: 6 }] },
    openSealed: (s: string) => openSealedTicket(s, provider),
    largestPayment: () => opts.float ?? 40_000_000n,
    pay: async (a: Paid) => {
      if (opts.failOn === paid.length) return { status: "error", message: "rpc down" };
      paid.push(a);
      return { status: "done", payment: `n-${paid.length}`, hash: `0x${String(paid.length).padStart(64, "0")}` };
    },
    payByClaimLink: async (a: Paid) => {
      paid.push({ ...a, to: "claim-link" });
      return { status: "done", claimHandle: `c-${paid.length}`, hash: `0x${String(paid.length).padStart(64, "0")}`, sealedLink: `gloam2t.sealed-for-${a.sealTo?.slice(0, 12)}` };
    },
    provePayment: async ({ handle }: { handle: string }) => ({ status: "done", proof: `gloampay1:proof-of-${handle}` }),
  };
  return { wallet: w as unknown as GloamAgent, paid };
}

class FakeSession implements JobSessionLike {
  status: DerivedStatus = "open";
  budget: AssetTokenLike | null = null;
  submitted: string | null = null;
  rejected: string | null = null;
  messages: string[] = [];
  job;
  constructor(
    readonly jobId: string,
    evaluator: string = NO_EVALUATOR,
    description = OFFERING_NAME
  ) {
    this.job = {
      chainId: 84532,
      clientAddress: "0x00000000000000000000000000000000000000c1",
      providerAddress: "0x00000000000000000000000000000000000000a1",
      evaluatorAddress: evaluator,
      description,
      budget: assetToken(TOKEN, "USDC", 6, 0n),
      expiredAt: BigInt(Math.floor(Date.now() / 1000) + 3600),
      hookAddress: NO_EVALUATOR,
    };
  }
  readonly chainId = 84532;
  async setBudget(a: AssetTokenLike) {
    this.budget = a;
    this.status = "budget_set";
    this.job = { ...this.job, budget: a };
  }
  async submit(d: string) {
    this.submitted = d;
    this.status = "submitted";
  }
  async sendMessage(m: string) {
    this.messages.push(m);
  }
  async reject(r: string) {
    this.rejected = r;
    this.status = "rejected";
  }
}

const requirementEntry = (jobId: string, content: unknown): JobRoomEntry => ({ kind: "message", onChainJobId: jobId, chainId: 84532, from: "0xc1", contentType: "requirement", content: JSON.stringify(content), timestamp: 0 });
const funded = (jobId: string): JobRoomEntry => ({ kind: "system", onChainJobId: jobId, chainId: 84532, event: { type: "job.funded", jobId, client: "0xc1", amount: 10 }, timestamp: 0 });

function providerFor(wallet: GloamAgent, extra: Partial<ConstructorParameters<typeof PrivatePayoutProvider>[0]> = {}) {
  return new PrivatePayoutProvider({
    wallet,
    budgetToken: (raw) => assetToken(TOKEN, "USDC", 6, raw),
    acpFeeBps: () => 100,
    journalPath: join(mkdtempSync(join(tmpdir(), "gloam-acp-journal-")), "jobs.json"),
    log: () => undefined,
    ...extra,
  });
}

test("the quote leaves the provider the payouts plus its fee after Virtuals' cut", async () => {
  const pk = await key();
  const { wallet } = fakeWallet(pk);
  const p = providerFor(wallet);
  const s = new FakeSession("1");
  const q = await p.quote(s, [{ to: "x", amount: "7" }, { to: "y", amount: "3" }]);
  assert.equal(q.total, 10_000_000n);
  assert.equal(q.fee, 50_000n, "0.5% of 10 is 0.05, the minimum");
  assert.equal(q.budget, 10_151_516n);
  assert.ok((q.budget * 9_900n) / 10_000n >= q.total + q.fee);
  const p5 = providerFor(wallet, { acpFeeBps: () => 500 });
  const q5 = await p5.quote(s, [{ to: "x", amount: "10" }]);
  assert.equal(q5.budget, 10_578_948n);
  assert.ok((q5.budget * 9_500n) / 10_000n >= q5.total + q5.fee);
});

test("a full job: quote, pay each payout privately, prove, deliver sealed to the client", async () => {
  const pk = await key();
  const r1 = await key();
  const client = await key();
  const { wallet, paid } = fakeWallet(pk);
  const p = providerFor(wallet);
  const s = new FakeSession("440");
  const req = await buildPayoutRequirement({ payouts: [{ to: r1.tag, amount: "7", note: "march" }, { to: "claim-link", amount: "3" }], providerAddress: pk.tag, replyTo: client.tag });
  await p.onEntry(s, requirementEntry("440", req));
  assert.equal(s.budget?.rawAmount, 10_151_516n);
  assert.match(s.messages[0]!, /Quote: 10 USDC in 2 private payout/);
  s.status = "funded";
  await p.onEntry(s, funded("440"));
  assert.deepEqual(paid.map((x) => [x.to === r1.tag ? "r1" : x.to, x.amount, x.note]), [["r1", "7", "march"], ["claim-link", "3", "ACP job 440"]]);
  assert.equal(paid[1]!.sealTo, client.tag, "the claim link is sealed to the client");
  const out = JSON.parse(s.submitted!);
  assert.equal(out.type, DELIVERABLE_TYPE);
  assert.ok(out.sealed.startsWith("gloam2t."));
  assert.ok(!s.submitted!.includes(r1.tag), "the stored deliverable does not name a recipient");
  const inner = JSON.parse(await openSealedTicket(out.sealed, client));
  assert.deepEqual(inner.payouts.map((x: { status: string; proof: string }) => [x.status, x.proof]), [["paid", "gloampay1:proof-of-n-1"], ["paid", "gloampay1:proof-of-c-2"]]);
  assert.equal(p.status(84532, "440")?.state, "submitted");
  // A replayed funded event pays nothing twice.
  await p.onEntry(s, funded("440"));
  assert.equal(paid.length, 2);
});

test("refusals before anything is committed", async () => {
  const pk = await key();
  const r1 = await key();
  const req = { payouts: [{ to: r1.tag, amount: "7" }] };
  const cases: [string, PrivatePayoutProvider, FakeSession, unknown, RegExp][] = [
    ["offering", providerFor(fakeWallet(pk).wallet), new FakeSession("2", NO_EVALUATOR, "something_else"), req, /unsupported offering/],
    ["evaluator", providerFor(fakeWallet(pk).wallet), new FakeSession("3", "0x00000000000000000000000000000000000000e1"), req, /untrusted evaluator/],
    ["limit", providerFor(fakeWallet(pk).wallet, { maxPerJob: "5" }), new FakeSession("4"), req, /over job limit/],
    ["float", providerFor(fakeWallet(pk, { float: 6_000_000n }).wallet), new FakeSession("5"), req, /not enough float/],
    ["bad", providerFor(fakeWallet(pk).wallet), new FakeSession("6"), { payouts: [{ to: "claim-link", amount: "1" }] }, /bad requirement/],
  ];
  for (const [name, p, s, r, want] of cases) {
    await p.onEntry(s, requirementEntry(s.jobId, r));
    assert.match(String(s.rejected), want, name);
    assert.equal(s.budget, null, `${name}: no budget set`);
  }
  // A trusted evaluator is fine.
  const ok = new FakeSession("7", "0x00000000000000000000000000000000000000e1");
  await providerFor(fakeWallet(pk).wallet, { trustedEvaluators: ["0x00000000000000000000000000000000000000E1"] }).onEntry(ok, requirementEntry("7", req));
  assert.equal(ok.rejected, null);
  assert.ok(ok.budget);
});

test("a payout that fails stops the job without submitting, and a restart picks up where it stopped", async () => {
  const pk = await key();
  const r1 = await key();
  const r2 = await key();
  const journalPath = join(mkdtempSync(join(tmpdir(), "gloam-acp-journal-")), "jobs.json");
  const first = fakeWallet(pk, { failOn: 1 });
  const p = providerFor(first.wallet, { journalPath });
  const s = new FakeSession("9");
  await p.onEntry(s, requirementEntry("9", { payouts: [{ to: r1.tag, amount: "2" }, { to: r2.tag, amount: "3" }] }));
  s.status = "funded";
  await p.onEntry(s, funded("9"));
  assert.equal(first.paid.length, 1);
  assert.equal(s.submitted, null, "not submitted: with no evaluator a submit would release the whole budget");
  assert.equal(p.status(84532, "9")?.state, "stuck");
  assert.match(s.messages.at(-1)!, /claim a refund/);
  // The owner fixes the RPC and restarts: only the second payout goes out.
  const second = fakeWallet(pk);
  const again = providerFor(second.wallet, { journalPath });
  assert.equal(again.status(84532, "9")?.results.filter((r) => r.status === "paid").length, 1);
  await again.onEntry(s, funded("9"));
  assert.deepEqual(second.paid.map((x) => x.amount), ["3"]);
  assert.ok(s.submitted, "submitted once every payout is paid");
  assert.equal(again.status(84532, "9")?.state, "submitted");
});

test("a funded job this provider never quoted is left alone", async () => {
  const pk = await key();
  const { wallet, paid } = fakeWallet(pk);
  const p = providerFor(wallet);
  const s = new FakeSession("11");
  s.status = "funded";
  await p.onEntry(s, funded("11"));
  assert.equal(paid.length, 0);
  assert.equal(s.submitted, null);
  keys = [];
});
