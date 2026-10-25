import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_SEPOLIA_USDC, generateReceiveKey, openSealedTicket, type ReceiveKey } from "@gloamtrade/sdk";
import { NO_EVALUATOR } from "../src/acp.ts";
import { OFFERING_NAME, PRIVATE_PAYOUT_OFFERING, RequirementError, buildPayoutRequirement, parseRequirement } from "../src/offering.ts";
import { DELIVERABLE_TYPE } from "../src/provider.ts";
import { ACP_STATUS, CLIENT, FakeAcp, FakeSession, fakeWallet, funded, providerFor, rejected, requirementEntry } from "./fakes.mts";

let keys: ReceiveKey[] = [];
async function key() {
  const k = await generateReceiveKey();
  keys.push(k);
  return k;
}

test("the offering is a plain ACP offering record", () => {
  assert.equal(PRIVATE_PAYOUT_OFFERING.name, OFFERING_NAME);
  assert.equal(PRIVATE_PAYOUT_OFFERING.requiredFunds, true, "acp-node-v2 then creates the job with the FundTransferHook");
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

// ------------------------------------------------------------------ a provider against fakes (./fakes.mts)

test("the quote: the payouts by fund transfer, and an escrowed fee that survives Virtuals' cut", async () => {
  const pk = await key();
  const acp = new FakeAcp();
  const { wallet } = fakeWallet(pk, acp);
  const p = providerFor(wallet);
  const s = new FakeSession("1", acp);
  const q = await p.quote(s, [{ to: "x", amount: "7" }, { to: "y", amount: "3" }]);
  assert.equal(q.total, 10_000_000n);
  assert.equal(q.transfer, 10_000_000n);
  assert.equal(q.fee, 50_000n, "0.5% of 10 is 0.05, the minimum");
  assert.equal(q.budget, 50_506n, "only the fee is escrowed, grossed up for 1%");
  assert.ok((q.budget * 9_900n) / 10_000n >= q.fee);
  // A plain escrow job escrows everything.
  const e = await p.quote(s, [{ to: "x", amount: "7" }, { to: "y", amount: "3" }], "escrow");
  assert.equal(e.budget, 10_151_516n);
  assert.equal(e.transfer, 0n);
  const p5 = providerFor(wallet, { acpFeeBps: () => 500 });
  const q5 = await p5.quote(s, [{ to: "x", amount: "10" }], "escrow");
  assert.equal(q5.budget, 10_578_948n);
  assert.ok((q5.budget * 9_500n) / 10_000n >= q5.total + q5.fee);
});

test("a full job: quote, pay each payout privately, prove, deliver sealed to the client", async () => {
  const pk = await key();
  const r1 = await key();
  const client = await key();
  const acp = new FakeAcp();
  const { wallet, paid } = fakeWallet(pk, acp);
  const p = providerFor(wallet);
  const s = new FakeSession("440", acp);
  const req = await buildPayoutRequirement({ payouts: [{ to: r1.tag, amount: "7", note: "march" }, { to: "claim-link", amount: "3" }], providerAddress: pk.tag, replyTo: client.tag });
  await p.onEntry(s, requirementEntry("440", req));
  assert.equal(s.budget?.rawAmount, 50_506n);
  assert.equal(s.transfer?.token.rawAmount, 10_000_000n);
  assert.equal(s.transfer?.token.address, BASE_SEPOLIA_USDC, "the payout total moves in the Gloam asset");
  assert.equal(s.transfer?.destination, "0x00000000000000000000000000000000000000a1", "to the provider's own wallet");
  assert.match(s.messages[0]!, /Quote: 10 USDC in 2 private payout/);
  s.fund();
  await p.onEntry(s, funded("440"));
  assert.deepEqual(paid.map((x) => [x.to === r1.tag ? "r1" : x.to, x.amount, x.note]), [["r1", "7", "march"], ["claim-link", "3", "ACP job 440"]]);
  assert.equal(paid[1]!.sealTo, client.tag, "the claim link is sealed to the client");
  const out = JSON.parse(s.submitted!);
  assert.equal(out.type, DELIVERABLE_TYPE);
  assert.ok(out.sealed.startsWith("gloam2t."));
  assert.ok(!s.submitted!.includes(r1.tag), "the stored deliverable does not name a recipient");
  const inner = JSON.parse(await openSealedTicket(out.sealed, client));
  assert.deepEqual(inner.payouts.map((x: { status: string; proof: string }) => [x.status, x.proof]), [["paid", "gloampay1:proof-of-n-1"], ["paid", "gloampay1:proof-of-c-2"]]);
  assert.match(inner.verify, /does not show who received it/, "a proof of payment is not presented as proof of delivery");
  assert.equal(p.status(84532, "440")?.state, "submitted");
  // A replayed funded event pays nothing twice.
  await p.onEntry(s, funded("440"));
  assert.equal(paid.length, 2);
});

test("refusals before anything is committed", async () => {
  const pk = await key();
  const r1 = await key();
  const req = { payouts: [{ to: r1.tag, amount: "7" }] };
  const acp = new FakeAcp();
  const E1 = "0x00000000000000000000000000000000000000e1";
  const cases: [string, ReturnType<typeof providerFor>, FakeSession, unknown, RegExp][] = [
    ["offering", providerFor(fakeWallet(pk, acp).wallet), new FakeSession("2", acp, CLIENT, "something_else"), req, /unsupported offering/],
    ["evaluator", providerFor(fakeWallet(pk, acp).wallet), new FakeSession("3", acp, E1), req, /evaluator/],
    ["no evaluator on a fund-transfer job", providerFor(fakeWallet(pk, acp).wallet), new FakeSession("14", acp, NO_EVALUATOR), req, /no evaluator/],
    ["no evaluator on a trusted client's escrow job", providerFor(fakeWallet(pk, acp).wallet, { trustedClients: [CLIENT] }), new FakeSession("16", acp, NO_EVALUATOR, OFFERING_NAME, NO_EVALUATOR), req, /no evaluator/],
    ["third-party evaluator on an escrow job", providerFor(fakeWallet(pk, acp).wallet, { trustedClients: [CLIENT] }), new FakeSession("15", acp, E1, OFFERING_NAME, NO_EVALUATOR), req, /untrusted evaluator/],
    ["limit", providerFor(fakeWallet(pk, acp).wallet, { maxPerJob: "5" }), new FakeSession("4", acp), req, /over job limit/],
    ["float", providerFor(fakeWallet(pk, acp, { float: 6_000_000n }).wallet), new FakeSession("5", acp), req, /not enough float/],
    ["bad", providerFor(fakeWallet(pk, acp).wallet), new FakeSession("6", acp), { payouts: [{ to: "claim-link", amount: "1" }] }, /bad requirement/],
    ["escrow job", providerFor(fakeWallet(pk, acp).wallet, { trustedEvaluators: [E1] }), new FakeSession("8", acp, E1, OFFERING_NAME, NO_EVALUATOR), req, /fund-transfer jobs only/],
    ["other hook", providerFor(fakeWallet(pk, acp).wallet), new FakeSession("10", acp, CLIENT, OFFERING_NAME, "0x00000000000000000000000000000000000000f9"), req, /unsupported hook/],
  ];
  for (const [name, p, s, r, want] of cases) {
    await p.onEntry(s, requirementEntry(s.jobId, r));
    assert.match(String(s.rejected), want, name);
    assert.equal(s.budget, null, `${name}: no budget set`);
  }
  // A trusted evaluator is fine.
  const ok = new FakeSession("7", acp, E1);
  await providerFor(fakeWallet(pk, acp).wallet, { trustedEvaluators: ["0x00000000000000000000000000000000000000E1"] }).onEntry(ok, requirementEntry("7", req));
  assert.equal(ok.rejected, null);
  assert.ok(ok.budget);
  // A plain escrow job from a trusted client, with an evaluator the owner trusts, is fine, and escrows the whole amount.
  const trusted = new FakeSession("12", acp, E1, OFFERING_NAME, NO_EVALUATOR);
  await providerFor(fakeWallet(pk, acp).wallet, { trustedClients: [CLIENT], trustedEvaluators: [E1] }).onEntry(trusted, requirementEntry("12", req));
  assert.equal(trusted.rejected, null);
  assert.equal(trusted.transfer, null);
  assert.equal(trusted.budget?.rawAmount, 7_121_213n, "(7 + 0.05) / 0.99, rounded up");
});

test("a client that rejects a funded job gets its principal back and nothing is paid out", async () => {
  const pk = await key();
  const r1 = await key();
  const acp = new FakeAcp();
  const { wallet, paid } = fakeWallet(pk, acp);
  const refunds: [string, string, bigint][] = [];
  const p = providerFor(wallet, { refund: async (to, token, raw) => (refunds.push([to, token, raw]), "0xrefund") });
  const s = new FakeSession("13", acp);
  await p.onEntry(s, requirementEntry("13", { payouts: [{ to: r1.tag, amount: "4" }] }));
  s.fund();
  // The client's reject lands on chain before the provider gets to the payouts.
  acp.set("13", { status: ACP_STATUS.rejected });
  s.status = "rejected";
  await p.onEntry(s, funded("13"));
  await p.onEntry(s, rejected("13"));
  assert.equal(paid.length, 0);
  assert.deepEqual(refunds, [[CLIENT, BASE_SEPOLIA_USDC, 4_000_000n]]);
  assert.equal(p.status(84532, "13")?.state, "rejected");
  assert.equal(p.status(84532, "13")?.refundTx, "0xrefund");
  // A job rejected before it was ever funded owes nothing back.
  const s2 = new FakeSession("17", acp);
  await p.onEntry(s2, requirementEntry("17", { payouts: [{ to: r1.tag, amount: "4" }] }));
  acp.set("17", { status: ACP_STATUS.rejected });
  s2.status = "rejected";
  await p.onEntry(s2, rejected("17"));
  assert.equal(refunds.length, 1, "no refund of principal that never arrived");
});

test("a payout that fails stops the job without submitting, and a restart picks up where it stopped", async () => {
  const pk = await key();
  const r1 = await key();
  const r2 = await key();
  const journalPath = join(mkdtempSync(join(tmpdir(), "gloam-acp-journal-")), "jobs.json");
  const acp = new FakeAcp();
  const first = fakeWallet(pk, acp, { failOn: 1 });
  const p = providerFor(first.wallet, { journalPath });
  const s = new FakeSession("9", acp);
  await p.onEntry(s, requirementEntry("9", { payouts: [{ to: r1.tag, amount: "2" }, { to: r2.tag, amount: "3" }] }));
  s.fund();
  await p.onEntry(s, funded("9"));
  assert.equal(first.paid.length, 1);
  assert.equal(s.submitted, null, "not submitted: a job not paid in full is never submitted");
  assert.equal(p.status(84532, "9")?.state, "stuck");
  assert.match(s.messages.at(-1)!, /sends back the part of your payout total/);
  // The owner fixes the RPC and restarts: only the second payout goes out.
  const second = fakeWallet(pk, acp);
  second.notes.push(...first.notes);
  const again = providerFor(second.wallet, { journalPath });
  assert.equal(again.status(84532, "9")?.results.filter((r) => r.status === "paid").length, 1);
  await again.onEntry(s, funded("9"));
  assert.deepEqual(second.paid.map((x) => x.amount), ["3"]);
  assert.ok(s.submitted, "submitted once every payout is paid");
  assert.equal(again.status(84532, "9")?.state, "submitted");
});

test("a funded job this provider never quoted is left alone", async () => {
  const pk = await key();
  const acp = new FakeAcp();
  const { wallet, paid } = fakeWallet(pk, acp);
  const p = providerFor(wallet);
  const s = new FakeSession("11", acp);
  s.fund();
  await p.onEntry(s, funded("11"));
  assert.equal(paid.length, 0);
  assert.equal(s.submitted, null);
  keys = [];
});

test("the live script's limits: each example file is enforceable on its network, and .env.example names one of them", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { loadLimits } = await import("@gloamtrade/game-plugin-gloam");
  const { EXAMPLE_LIMITS, limitsFileFor } = await import("../src/limitsFile.ts");
  for (const [network, file] of Object.entries(EXAMPLE_LIMITS)) {
    const loaded = loadLimits({ agent: "private-payout", network: network as never, file, readFile: (p) => readFileSync(p, "utf8") });
    assert.equal(loaded.mode, "enforced", `${network}: ${"error" in loaded ? loaded.error : ""}`);
  }
  const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.example"), "utf8");
  const network = env.match(/^GLOAM_NETWORK=(\S+)/m)![1]!;
  assert.equal(limitsFileFor(network, {}), EXAMPLE_LIMITS[network]);
  assert.equal(limitsFileFor(network, { GLOAM_LIMITS_FILE: "/x/limits.json" }), "/x/limits.json");
  assert.throws(() => limitsFileFor("tempo-mainnet", {}), /GLOAM_LIMITS_FILE/);
});
