/**
 * Self-test: partner link codes, link attribution checked on chain, the
 * on-chain match of past cash outs, and partner analytics.
 *
 *  - link codes: issue (by the partner, by an admin), list, revoke (only the
 *    owner or an admin), the live-code cap, expiry; a forged, malformed, revoked
 *    or expired code, or one whose account is gone, counts for nobody
 *  - links: `p=` rides in the pay and swap links' fragment; a name or ref alone
 *    is never a code; a code of the wrong shape is dropped
 *  - the classifier (lib/partnerVerify) on real Robinhood Chain mainnet receipts
 *    (scripts/fixtures/partner-attribution-rh.json, recipients replaced with
 *    made-up addresses): a cash out, a private payment and a vault swap are read
 *    for what they are; a random transaction, a refund, an unknown router's
 *    event and two actions in one transaction are refused
 *  - attribution (lib/partnerAttribution) with a fake chain reader: a real vault
 *    transaction counts, a random one doesn't, a hash from another chain
 *    doesn't, the same transaction twice counts once, the flow must fit, the
 *    window holds, and the route refuses bad input before any read
 *  - privacy: the partner store holds no wallet, no cash-out recipient, no IP
 *  - analytics: totals by source (API key, link, matched on chain), by kind, by
 *    asset and by day, with the vault's fee; the CSV files
 *  - the on-chain match (lib/partnerBackfill) over recorded Unshielded logs: a
 *    dry run writes nothing; a real pass counts a partner's cash outs once, with
 *    the vault fee and the block's time, refuses a swap's escrow leg, keeps its
 *    cursor, stops at its time budget; live attribution and the match never
 *    count one transaction twice; deploy blocks match contracts/deployments
 *  - receiving addresses: parsing pasted text and CSVs, one partner per address
 *
 * The partner store is the in-process one and every chain read is a fake: nothing
 * reaches any host.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-partner-attribution.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

// the admin routes read lib/adminAuth, which is marked server only
const serverOnlyStub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolveFilename = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? serverOnlyStub : resolveFilename.call(this, req, ...rest);
};

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "test";

const { resetMemoryKv, kv1, k } = await import("../src/lib/partnersKv");
const P = await import("../src/lib/partners");
const L = await import("../src/lib/partnerLinks");
const { classifyVaultTx, kindFitsFlow } = await import("../src/lib/partnerVerify");
const A = await import("../src/lib/partnerAttribution");
const B = await import("../src/lib/partnerBackfill");
const AD = await import("../src/lib/partnerAddresses");
const { getNetwork } = await import("../src/lib/networks");
const { swapRoutersOn, EVERY_SWAP_ROUTER } = await import("../src/lib/vaultSwap");
const { buildPaymentRequestLink, readPaymentRequest, requestParamsFrom, requestAssetsFor } = await import("../src/lib/paymentRequest");
const { buildSwapLink, swapLinkFromHash } = await import("../src/lib/swapLink");
const { ApiError } = await import("../src/lib/partnersApi");
const { POST: attributePost } = await import("../src/app/api/partners/attribute/route");
const { GET: linkCodeGet } = await import("../src/app/api/partners/link-code/route");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

async function throwsApi(p: Promise<unknown>, status: number, code: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ApiError, `expected an ApiError, got ${String(e)}`);
    assert.equal(e.status, status, `status for ${code}: ${e.message}`);
    assert.equal(e.code, code);
    return;
  }
  assert.fail(`expected ${status} ${code}`);
}

resetMemoryKv();
const RH = getNetwork("robinhood-mainnet");
const TEMPO = getNetwork("tempo-mainnet");

type Fixture = {
  chainId: number;
  pool: string;
  cashOuts: Hex[];
  privatePayment: Hex;
  swap: Hex;
  receipts: Record<string, { status: "success"; blockNumber: string; blockTimestamp: number; logs: { address: string; topics: string[]; data: string }[] }>;
  unshieldLogs: { txHash: Hex; blockNumber: string; nullifier: Hex; asset: Address; to: Address; amount: string }[];
};
const FX = JSON.parse(readFileSync(new URL("./fixtures/partner-attribution-rh.json", import.meta.url), "utf8")) as Fixture;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ctxRH = { pool: RH.pool!, routers: swapRoutersOn(RH.chainId).map((r) => r.address), anyRouter: EVERY_SWAP_ROUTER };
const rcpt = (h: Hex) => FX.receipts[h]!;

const partner = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Motion", fees: { cashoutBps: 10 } });
const other = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Raeto" });

// ---------------------------------------------------------------- link codes

await test("codes: a partner and an admin each issue one; 20 letters and digits, unique, listed newest first", async () => {
  const a = await L.issueLinkCode({ partnerId: partner.id, label: "Fund button", by: "partner", now: 1_000 });
  const b = await L.issueLinkCode({ partnerId: partner.id, label: "  Swap‮page ", by: "admin", now: 2_000 });
  assert.match(a.code, /^[A-Za-z0-9]{20}$/);
  assert.notEqual(a.code, b.code);
  assert.equal(b.label, "Swap page", "a direction override is taken out of a label");
  assert.equal(b.createdBy, "admin");
  const list = await L.listLinkCodes(partner.id);
  assert.deepEqual(list.map((c) => c.code), [b.code, a.code]);
  const seen = new Set(Array.from({ length: 2_000 }, () => L.generateLinkCode()));
  assert.equal(seen.size, 2_000);
  for (const c of seen) assert.ok(L.isLinkCodeShape(c));
});

await test("codes: revoke only by the owner (or an admin); revoking twice keeps the first time", async () => {
  const c = await L.issueLinkCode({ partnerId: partner.id, by: "partner" });
  assert.equal(await L.revokeLinkCode({ code: c.code, partnerId: other.id }), null, "another partner can't");
  assert.ok(await L.resolveLinkCode(c.code), "still live");
  const r = await L.revokeLinkCode({ code: c.code, partnerId: partner.id, now: 5_000 });
  assert.equal(r?.revokedAt, 5_000);
  const again = await L.revokeLinkCode({ code: c.code, now: 9_000 });
  assert.equal(again?.revokedAt, 5_000);
  assert.equal(await L.resolveLinkCode(c.code), null, "a revoked code counts for nobody");
  assert.equal(L.linkCodeState(r!), "revoked");
});

await test("codes: forged, malformed, expired and orphaned codes resolve to nobody", async () => {
  assert.equal(await L.resolveLinkCode(L.generateLinkCode()), null, "a code of the right shape this store never issued");
  for (const bad of ["", "short", "x".repeat(21), "abc$efghijklmnopqrst", null, 42, { code: "x" }]) {
    assert.equal(await L.resolveLinkCode(bad), null);
  }
  const t0 = Date.now();
  const e = await L.issueLinkCode({ partnerId: partner.id, expiresInDays: 1, by: "admin", now: t0 });
  assert.ok(await L.resolveLinkCode(e.code, t0 + 60_000));
  assert.equal(await L.resolveLinkCode(e.code, t0 + 86_400_000 + 1), null, "expired");
  for (const d of [0, -1, 1.5, 731, "x"]) {
    await assert.rejects(L.issueLinkCode({ partnerId: partner.id, expiresInDays: d, by: "admin" }), /Expiry/);
  }
  await assert.rejects(L.issueLinkCode({ partnerId: "ptr_nobody00", by: "admin" }), /No partner/);
  // a code whose account record is gone
  const ghost = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Ghost" });
  const g = await L.issueLinkCode({ partnerId: ghost.id, by: "admin" });
  await kv1(["DEL", k("partner", ghost.id)]);
  assert.equal(await L.resolveLinkCode(g.code), null);
});

await test("codes: at most MAX_LIVE_CODES live codes; revoked ones don't count", async () => {
  const p = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Busy" });
  const made = [];
  for (let i = 0; i < L.MAX_LIVE_CODES; i++) made.push(await L.issueLinkCode({ partnerId: p.id, by: "partner" }));
  await assert.rejects(L.issueLinkCode({ partnerId: p.id, by: "partner" }), /Revoke one first/);
  await L.revokeLinkCode({ code: made[0]!.code, partnerId: p.id });
  assert.ok(await L.issueLinkCode({ partnerId: p.id, by: "partner" }));
});

await test("code lookup route: the name comes from the account; unknown codes name nobody", async () => {
  const c = await L.issueLinkCode({ partnerId: partner.id, by: "partner" });
  const ok = await linkCodeGet(new Request(`http://localhost:3000/api/partners/link-code?code=${c.code}`));
  assert.equal(ok.status, 200);
  assert.deepEqual(((await ok.json()) as { data: unknown }).data, { name: "Motion" });
  const none = await linkCodeGet(new Request(`http://localhost:3000/api/partners/link-code?code=${L.generateLinkCode()}`));
  assert.equal(none.status, 404);
  const bad = await linkCodeGet(new Request("http://localhost:3000/api/partners/link-code?code=Motion"));
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------- links

await test("links: p= rides in the fragment of pay and swap links; name and ref are never a code", async () => {
  const code = L.generateLinkCode();
  const usdg = requestAssetsFor("robinhood-mainnet").find((a) => a.symbol === "USDG")!;
  const pay = buildPaymentRequestLink({ to: "0x00000000000000000000000000000000000A11c1", network: "robinhood-mainnet", asset: usdg, amount: "25", name: "Motion", partnerCode: code });
  const u = new URL(pay);
  assert.equal(u.searchParams.get("p"), null, "not in the query");
  assert.equal(new URLSearchParams(u.hash.slice(1)).get("p"), code);
  const r = readPaymentRequest(requestParamsFrom(u.search, u.hash), "robinhood-mainnet")!;
  assert.equal(r.partnerCode, code);
  assert.equal(r.name, "Motion");
  const nameOnly = readPaymentRequest(new URLSearchParams("to=0x00000000000000000000000000000000000A11c1&amount=1&name=Motion"), "robinhood-mainnet")!;
  assert.equal(nameOnly.partnerCode, null);
  const forged = readPaymentRequest(new URLSearchParams("to=0x00000000000000000000000000000000000A11c1&p=Motion"), "robinhood-mainnet")!;
  assert.equal(forged.partnerCode, null, "a name in p is not a code's shape");
  assert.ok(!buildPaymentRequestLink({ to: "0x00000000000000000000000000000000000A11c1", network: "robinhood-mainnet", asset: usdg, amount: "", partnerCode: "Motion" }).includes("p="));

  const swap = buildSwapLink({ from: "USDG", to: "GLOAM", amount: "100", network: "robinhood-mainnet", ref: "Motion", partnerCode: code });
  const s = swapLinkFromHash(new URL(swap).hash, "robinhood-mainnet")!;
  assert.equal(s.partnerCode, code);
  assert.equal(s.ref, "Motion");
  const refOnly = swapLinkFromHash("#from=USDG&to=GLOAM&ref=Motion", "robinhood-mainnet")!;
  assert.equal(refOnly.partnerCode, null);
});

// ---------------------------------------------------------------- classifier

await test("classifier: real Robinhood Chain receipts read as a cash out, a private payment and a vault swap", () => {
  const out = classifyVaultTx(rcpt(FX.cashOuts[0]!).logs, ctxRH);
  assert.deepEqual(out, { ok: true, kind: "cash_out", asset: USDG, amount: 2_000_000n, vaultFee: 5_000n });
  assert.deepEqual(classifyVaultTx(rcpt(FX.privatePayment).logs, ctxRH), { ok: true, kind: "private_payment" });
  const sw = classifyVaultTx(rcpt(FX.swap).logs, ctxRH);
  assert.ok(sw.ok && sw.kind === "private_swap");
  if (sw.ok && sw.kind === "private_swap") {
    assert.equal(sw.asset.toLowerCase(), USDG.toLowerCase());
    assert.equal(sw.amount, 2_000_000n);
    assert.equal(sw.vaultFee, 5_000n, "the vault's 0.25% on the swap's input");
  }
  assert.ok(kindFitsFlow("cash_out", "pay") && kindFitsFlow("private_payment", "pay") && !kindFitsFlow("private_swap", "pay"));
  assert.ok(kindFitsFlow("private_swap", "swap") && !kindFitsFlow("cash_out", "swap"));
});

await test("classifier: a random transaction, a refund, a stranger's VaultSwap event and packed actions are refused", () => {
  const swapLogs = rcpt(FX.swap).logs;
  // just the token transfer from a cash out: no vault log at all
  assert.deepEqual(classifyVaultTx(rcpt(FX.cashOuts[0]!).logs.slice(0, 1), ctxRH), { ok: false, reason: "not_vault" });
  assert.deepEqual(classifyVaultTx([], ctxRH), { ok: false, reason: "not_vault" });
  // the same logs, read as another vault: nothing of ours
  assert.deepEqual(classifyVaultTx(rcpt(FX.cashOuts[0]!).logs, { ...ctxRH, pool: "0x00000000000000000000000000000000000000aa" }), { ok: false, reason: "not_vault" });
  // a swap's VaultSwap event re-emitted by some other contract
  const forgedSwap = swapLogs.map((l) => (l.topics[0] === "0x203409a826ec460170d80821c1fd8c52d787fe15820120cb738d54b9b3f9163b" ? { ...l, address: "0x00000000000000000000000000000000000000bb" } : l));
  assert.deepEqual(classifyVaultTx(forgedSwap, ctxRH), { ok: false, reason: "unknown_router" });
  // a router's note coming in with no swap beside it: a refund
  const refund = swapLogs.filter((l) => l.topics[0] !== "0x203409a826ec460170d80821c1fd8c52d787fe15820120cb738d54b9b3f9163b" && !(l.address.toLowerCase() === RH.pool!.toLowerCase() && l.topics.length === 4 && l.topics[0]!.startsWith("0xb2fce2f2")));
  assert.deepEqual(classifyVaultTx(refund, ctxRH), { ok: false, reason: "refund" });
  // two actions packed in one transaction
  const packed = [...rcpt(FX.cashOuts[0]!).logs, ...rcpt(FX.privatePayment).logs];
  assert.deepEqual(classifyVaultTx(packed, ctxRH), { ok: false, reason: "mixed" });
  const twoOut = [...rcpt(FX.cashOuts[0]!).logs, ...rcpt(FX.cashOuts[1]!).logs];
  assert.deepEqual(classifyVaultTx(twoOut, ctxRH), { ok: false, reason: "mixed" });
});

// ---------------------------------------------------------------- attribution

type Chain = Map<number, Map<string, (typeof FX.receipts)[string]>>;
function fakeChain(chain: Chain, nowSec: number): import("../src/lib/partnerAttribution").AttributionDeps {
  return {
    receipt: async (net, hash) => {
      const r = chain.get(net.chainId)?.get(hash.toLowerCase());
      return r ? { status: r.status, blockNumber: BigInt(r.blockNumber), logs: r.logs } : null;
    },
    blockTime: async (net, block) => {
      for (const r of chain.get(net.chainId)?.values() ?? []) if (BigInt(r.blockNumber) === block) return r.blockTimestamp;
      throw new Error("no such block");
    },
    record: P.recordActivity,
    now: () => nowSec * 1000,
  };
}
const rhChain: Chain = new Map([[RH.chainId, new Map(Object.entries(FX.receipts).map(([h, r]) => [h.toLowerCase(), r]))]]);
const lastTs = Math.max(...Object.values(FX.receipts).map((r) => r.blockTimestamp));
const live = fakeChain(rhChain, lastTs + 600);
const motionCode = (await L.issueLinkCode({ partnerId: partner.id, label: "Fund", by: "partner" })).code;

await test("attribution: a real cash out, private payment and swap count to the code's partner, with public facts only", async () => {
  const c = await A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: FX.cashOuts[0]!, flow: "pay" }, live);
  assert.equal(c.kind, "cash_out");
  assert.equal(c.record.source, "link");
  assert.equal(c.record.linkCode, motionCode);
  assert.equal(c.record.keyId, null);
  assert.equal(c.record.amount, "2000000");
  assert.equal(c.record.vaultFee, "5000");
  assert.equal(c.record.vaultFeeUsd, 0.005);
  assert.equal(c.record.ts, rcpt(FX.cashOuts[0]!).blockTimestamp * 1000, "counted on the day it landed");
  const pp = await A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: FX.privatePayment, flow: "pay" }, live);
  assert.equal(pp.kind, "private_payment");
  assert.equal(pp.record.amount, null);
  assert.equal(pp.record.asset, null);
  const sw = await A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: FX.swap, flow: "swap" }, fakeChain(rhChain, rcpt(FX.swap).blockTimestamp + 60));
  assert.equal(sw.kind, "private_swap");
  assert.equal(sw.record.vaultFee, "5000");
  assert.equal(await P.attributedTo(RH.chainId, FX.swap), partner.id);
});

await test("attribution: the same transaction twice counts once, and never for a second partner", async () => {
  await throwsApi(A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: FX.cashOuts[0]!, flow: "pay" }, live), 409, "already_attributed");
  const raeto = (await L.issueLinkCode({ partnerId: other.id, by: "admin" })).code;
  await throwsApi(A.attributeLinkTx({ code: raeto, chainId: RH.chainId, txHash: FX.cashOuts[0]!.toUpperCase().replace("0X", "0x") as Hex, flow: "pay" }, live), 409, "already_attributed");
  const s = await P.readPartnerStats(partner.id);
  assert.equal(s.bySource.link.counts.cash_out, 1);
  assert.equal((await P.readPartnerStats(other.id)).totals.cashOuts, 0);
  // claimTransaction sees the same claim
  assert.equal(await P.claimTransaction(other, RH.chainId, FX.cashOuts[0]!), false);
});

await test("attribution: a random tx, a hash from another chain, a failed tx and a wrong flow count for nothing", async () => {
  const random = `0x${"ab".repeat(32)}` as Hex;
  const chain: Chain = new Map([
    [RH.chainId, new Map([...rhChain.get(RH.chainId)!, [random, { ...rcpt(FX.cashOuts[0]!), logs: rcpt(FX.cashOuts[0]!).logs.slice(0, 1) }]])],
    [TEMPO.chainId, new Map()],
  ]);
  const deps = fakeChain(chain, lastTs + 600);
  await throwsApi(A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: random, flow: "pay" }, deps), 422, "not_vault_action");
  // a real Robinhood Chain vault transaction, claimed on Tempo (the vault has the same address there)
  await throwsApi(A.attributeLinkTx({ code: motionCode, chainId: TEMPO.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, deps), 404, "tx_not_found");
  await throwsApi(A.attributeLinkTx({ code: motionCode, chainId: 999_999, txHash: FX.cashOuts[1]!, flow: "pay" }, deps), 400, "bad_chain");
  // a pay link can't count a swap, a swap link can't count a cash out
  const fresh = new Map(rhChain.get(RH.chainId)!);
  const swapNow = fakeChain(new Map([[RH.chainId, fresh]]), rcpt(FX.swap).blockTimestamp + 60);
  const p2 = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Flowtest" });
  const c2 = (await L.issueLinkCode({ partnerId: p2.id, by: "admin" })).code;
  resetClaims([FX.swap]);
  await throwsApi(A.attributeLinkTx({ code: c2, chainId: RH.chainId, txHash: FX.swap, flow: "pay" }, swapNow), 422, "wrong_flow");
  await throwsApi(A.attributeLinkTx({ code: c2, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "swap" }, deps), 422, "wrong_flow");
  const failed = fakeChain(new Map([[RH.chainId, new Map([[FX.cashOuts[1]!.toLowerCase(), { ...rcpt(FX.cashOuts[1]!), status: "reverted" as never }]])]]), lastTs + 600);
  await throwsApi(A.attributeLinkTx({ code: c2, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, failed), 422, "tx_failed");
  // too old: past the 72-hour window
  const late = fakeChain(rhChain, rcpt(FX.cashOuts[1]!).blockTimestamp + A.ATTRIBUTION_WINDOW_SEC + 1);
  await throwsApi(A.attributeLinkTx({ code: c2, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, late), 422, "too_old");
  assert.equal((await P.readPartnerStats(p2.id)).totals.cashOuts + (await P.readPartnerStats(p2.id)).totals.privateSwaps, 0);
});

await test("attribution: forged, revoked and expired codes count for nothing, before any chain read", async () => {
  let reads = 0;
  const counting: import("../src/lib/partnerAttribution").AttributionDeps = { ...live, receipt: async (n, h) => (reads++, live.receipt(n, h)) };
  await throwsApi(A.attributeLinkTx({ code: L.generateLinkCode(), chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, counting), 404, "code_not_live");
  const r = await L.issueLinkCode({ partnerId: partner.id, by: "partner" });
  await L.revokeLinkCode({ code: r.code, partnerId: partner.id });
  await throwsApi(A.attributeLinkTx({ code: r.code, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, counting), 404, "code_not_live");
  const e = await L.issueLinkCode({ partnerId: partner.id, expiresInDays: 1, by: "admin", now: (lastTs - 3 * 86_400) * 1000 });
  await throwsApi(A.attributeLinkTx({ code: e.code, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, counting), 404, "code_not_live");
  assert.equal(reads, 0);
});

await test("attribution input: only { code, chainId, txHash, flow }, each to the letter", () => {
  const ok = { code: motionCode, chainId: 4663, txHash: FX.cashOuts[1]!, flow: "pay" };
  assert.deepEqual(A.readAttributionInput(ok), { ...ok, txHash: FX.cashOuts[1]!.toLowerCase() });
  const bad: Record<string, unknown>[] = [
    { ...ok, wallet: "0x00000000000000000000000000000000000A11c1" },
    { ...ok, code: "Motion" },
    { ...ok, chainId: "4663" },
    { ...ok, chainId: -1 },
    { ...ok, txHash: "0x12" },
    { ...ok, flow: "deposit" },
    { code: motionCode },
  ];
  for (const b of bad) assert.throws(() => A.readAttributionInput(b), (e: unknown) => e instanceof ApiError && e.status === 400);
});

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/partners/attribute", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-for": "203.0.113.77", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

await test("attribute route: refuses other sites, junk and bad fields before any chain read", async () => {
  const cross = await attributePost(req({ code: motionCode, chainId: 4663, txHash: FX.cashOuts[0], flow: "pay" }, { origin: "https://elsewhere.example" }) as never);
  assert.equal(cross.status, 403);
  const junk = await attributePost(req("not json") as never);
  assert.equal(junk.status, 400);
  const big = await attributePost(req({ code: motionCode, pad: "x".repeat(600) }) as never);
  assert.equal(big.status, 413);
  const extra = await attributePost(req({ code: motionCode, chainId: 4663, txHash: FX.cashOuts[0], flow: "pay", wallet: "0x1" }) as never);
  assert.equal(extra.status, 400);
  // already counted: answered from the store, no chain read
  const dup = await attributePost(req({ code: motionCode, chainId: 4663, txHash: FX.cashOuts[0], flow: "pay" }) as never);
  assert.equal(dup.status, 409);
  assert.equal(((await dup.json()) as { error: { code: string } }).error.code, "already_attributed");
});

// ---------------------------------------------------------------- privacy

function storeText(): string {
  const g = globalThis as { __gloamPartnersMem?: Map<string, { v: unknown }> };
  const parts: string[] = [];
  for (const [key, e] of g.__gloamPartnersMem ?? new Map()) {
    parts.push(key);
    const v = e.v;
    if (typeof v === "string") parts.push(v);
    else if (v instanceof Map) for (const [a, b] of v) parts.push(a, b);
    else if (v instanceof Set) parts.push(...v);
    else if (Array.isArray(v)) parts.push(...v);
  }
  return parts.join("\n").toLowerCase();
}

await test("privacy: no payer wallet, no cash-out recipient and no IP anywhere in the partner store", async () => {
  const text = storeText();
  for (const fake of ["0x00000000000000000000000000000000000a11c1", "0x00000000000000000000000000000000000a11c2", "a11c1", "a11c2"]) {
    assert.ok(!text.includes(fake), `a cash out's recipient (${fake}) is not kept`);
  }
  assert.ok(!text.includes("203.0.113.77"), "the caller's IP is not kept");
  // the swap's escrow is not kept either
  assert.ok(!text.includes(FX.unshieldLogs.find((l) => l.txHash === FX.swap)!.to.toLowerCase()));
  const rec = (await P.readPartnerStats(partner.id, { recent: 50 })).recent.find((r) => r.txHash === FX.cashOuts[0]!.toLowerCase())!;
  assert.deepEqual(
    Object.keys(rec).sort(),
    ["amount", "asset", "chainId", "decimals", "feeBasis", "feeToken", "feeUsd", "id", "keyId", "kind", "linkCode", "network", "source", "symbol", "ts", "txHash", "vaultFee", "vaultFeeUsd", "volumeUsd"].sort()
  );
});

// ---------------------------------------------------------------- analytics

function resetClaims(hashes: Hex[]) {
  const g = globalThis as { __gloamPartnersMem?: Map<string, unknown> };
  for (const h of hashes) g.__gloamPartnersMem?.delete(k("tx", RH.chainId, h.toLowerCase()));
}

await test("analytics: totals by source, kind, asset and day, with the vault's fee; API is the total less the rest", async () => {
  const p = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Sums" });
  const T = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
  const day = Date.UTC(2026, 9, 30, 12);
  const today = Date.now();
  // API: a cash out of 100 USDG (fee 0.25), a private payment, a swap of 40 USDG (fee 0.10)
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "cash_out", txHash: T(1), edge: { asset: USDG as Address, amount: 100_000_000n }, vaultFee: 250_000n });
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "private_payment", txHash: T(2) });
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "private_swap", txHash: T(3), edge: { asset: USDG as Address, amount: 40_000_000n }, vaultFee: 100_000n });
  // link: a cash out of 20 USDG (fee 0.05), a private payment
  await P.recordActivity({ partner: p, keyId: null, source: "link", linkCode: motionCode, network: RH, kind: "cash_out", txHash: T(4), edge: { asset: USDG as Address, amount: 20_000_000n }, vaultFee: 50_000n });
  await P.recordActivity({ partner: p, keyId: "ignored", source: "link", network: RH, kind: "private_payment", txHash: T(5) });
  // matched on chain: a past cash out of 30 USDG (fee 0.075), on its own day
  await P.recordActivity({ partner: p, keyId: null, source: "chain", network: RH, kind: "cash_out", txHash: T(6), edge: { asset: USDG as Address, amount: 30_000_000n }, vaultFee: 75_000n, now: day });
  // a deposit: free in the vault
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "deposit", txHash: T(7), edge: { asset: USDG as Address, amount: 10_000_000n }, vaultFee: 999n });

  const s = await P.readPartnerStats(p.id, { recent: 20, days: 30 });
  assert.equal(s.totals.cashOuts, 3);
  assert.equal(s.totals.privatePayments, 2);
  assert.equal(s.totals.privateSwaps, 1);
  assert.equal(s.totals.publicVolumeUsd, 160, "cash outs 100 + 20 + 30, deposit 10");
  assert.equal(s.totals.swapVolumeUsd, 40);
  assert.ok(Math.abs(s.totals.vaultFeeUsd - 0.475) < 1e-9, "0.25 + 0.10 + 0.05 + 0.075, the deposit's is 0");
  assert.equal(s.byKind.deposit.vaultFeeUsd, 0);
  assert.deepEqual(s.bySource.api.counts, { private_payment: 1, cash_out: 1, deposit: 1, private_swap: 1 });
  assert.deepEqual(s.bySource.link.counts, { private_payment: 1, cash_out: 1, deposit: 0, private_swap: 0 });
  assert.deepEqual(s.bySource.chain.counts, { private_payment: 0, cash_out: 1, deposit: 0, private_swap: 0 });
  assert.equal(s.bySource.api.volumeUsd, 150, "100 out + 40 swap + 10 in");
  assert.equal(s.bySource.link.volumeUsd, 20);
  assert.equal(s.bySource.chain.volumeUsd, 30);
  assert.ok(Math.abs(s.bySource.api.vaultFeeUsd - 0.35) < 1e-9);
  assert.ok(Math.abs(s.bySource.link.vaultFeeUsd - 0.05) < 1e-9);
  assert.ok(Math.abs(s.bySource.chain.vaultFeeUsd - 0.075) < 1e-9);
  const usdg = s.byAsset.find((a) => a.symbol === "USDG")!;
  assert.equal(usdg.volume, "160");
  assert.equal(usdg.swapVolume, "40");
  assert.equal(usdg.vaultFee, "0.475");
  assert.deepEqual(usdg.byKind, { cash_out: "150", deposit: "10", private_swap: "40" });
  const back = s.daily.find((d) => d.day === "2026-10-30");
  if (back) {
    assert.equal(back.bySource.chain.counts.cash_out, 1, "a past match is counted on its own day");
    assert.equal(back.cashOuts, 1);
  }
  const t = s.daily.find((d) => d.day === P.utcDay(today))!;
  assert.equal(t.cashOuts, 2);
  assert.equal(t.privatePayments, 2);
  assert.equal(t.swapVolumeUsd, 40);
  assert.equal(t.bySource.link.counts.private_payment, 1);
  assert.ok(Math.abs(t.vaultFeeUsd - 0.4) < 1e-9);
  assert.ok(s.recent.every((r, i) => i === 0 || s.recent[i - 1]!.ts >= r.ts), "newest first by when it happened");
  assert.equal(s.recent.at(-1)!.source, "chain");
  // a past match never moves "last" back
  assert.ok(s.lastActivity! > day);

  // activity from before sources existed reads as API
  const legacy = P.summarizeStats({ "n:cash_out": 2, "usd:cash_out": 5_000_000 }, []);
  assert.equal(legacy.bySource.api.counts.cash_out, 2);
  assert.equal(legacy.bySource.api.volumeUsd, 5);
  assert.equal(legacy.bySource.link.counts.cash_out, 0);
});

await test("CSV: daily rows by source and kind, one row per transaction, formula cells defused", async () => {
  const p = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "=HYPERLINK(1)" });
  const T = (n: number) => `0x${(n + 500).toString(16).padStart(64, "0")}` as Hex;
  await P.recordActivity({ partner: p, keyId: null, source: "link", network: RH, kind: "cash_out", txHash: T(1), edge: { asset: USDG as Address, amount: 12_500_000n }, vaultFee: 31_250n });
  await P.recordActivity({ partner: p, keyId: "k", network: RH, kind: "private_payment", txHash: T(2) });
  const s = await P.readPartnerStats(p.id, { recent: 10, days: 3 });
  const daily = P.dailyCsv([{ id: p.id, name: p.name, daily: s.daily }]).trim().split("\r\n");
  assert.equal(daily[0], "Date (UTC),Partner id,Partner,Source,Kind,Count,Volume (USD),Vault fee (USD)");
  assert.equal(daily.length, 3);
  const today = P.utcDay(Date.now());
  assert.ok(daily.includes(`${today},${p.id},'=HYPERLINK(1),Via API key,Private payment,1,Hidden,0`));
  assert.ok(daily.includes(`${today},${p.id},'=HYPERLINK(1),Via link,Cash out,1,12.5,0.03125`));
  const tx = P.activityCsv([{ id: p.id, name: p.name, recent: s.recent }]).trim().split("\r\n");
  assert.equal(tx[0], "Time (UTC),Partner id,Partner,Source,Network,Chain id,Kind,Transaction,Token,Token address,Amount,Volume (USD),Vault fee,Vault fee (USD)");
  assert.equal(tx.length, 3);
  const out = tx.find((l) => l.includes("Cash out"))!.split(",");
  assert.equal(out[3], "Via link");
  assert.equal(out[7], T(1).toLowerCase());
  assert.equal(out[8], "USDG");
  assert.equal(out[10], "12.5");
  assert.equal(out[12], "0.03125");
  const pay = tx.find((l) => l.includes("Private payment"))!.split(",");
  assert.equal(pay[10], "", "a private payment has no amount");
  assert.equal(P.csvCell('a"b,c'), '"a""b,c"');
  assert.equal(P.csvCell("@cmd"), "'@cmd");
});

// ---------------------------------------------------------------- receiving addresses

await test("addresses: pasted lines and CSVs, chain names, checksums, duplicates; testnets refused", () => {
  const text = [
    "chain,address",
    "robinhood-mainnet,0x00000000000000000000000000000000000A11c2",
    "Tempo; 0x00000000000000000000000000000000000a11c9",
    "0x00000000000000000000000000000000000a11c2",
    "8453 0x00000000000000000000000000000000000a11ca",
    "Ethereum,0x00000000000000000000000000000000000a11cb",
    "robinhood,0x00000000000000000000000000000000000a11cc",
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "0x52908400098527886e0F7030069857D2E4169ee7",
    "# a comment",
    "not an address",
    "0x0000000000000000000000000000000000000000",
  ].join("\n");
  const r = AD.parseAddressList(text, 4663);
  assert.deepEqual(
    r.entries.map((e) => `${e.chainId}:${e.address}`),
    [
      "4663:0x00000000000000000000000000000000000a11c2",
      "4217:0x00000000000000000000000000000000000a11c9",
      "8453:0x00000000000000000000000000000000000a11ca",
      "1:0x00000000000000000000000000000000000a11cb",
      "4663:0x52908400098527886e0f7030069857d2e4169ee7",
    ]
  );
  const reasons = r.rejected.map((x) => x.reason);
  assert.ok(reasons.some((x) => /not a mainnet/.test(x)), "a testnet name is refused");
  assert.ok(reasons.some((x) => /checksum/.test(x)), "a mixed-case typo is caught");
  assert.ok(reasons.some((x) => /No 0x address/.test(x)));
  assert.ok(reasons.some((x) => /Not a valid address/.test(x)), "the zero address");
  const noChain = AD.parseAddressList("0x00000000000000000000000000000000000a11c2", null);
  assert.equal(noChain.entries.length, 0);
  assert.match(noChain.rejected[0]!.reason, /No chain/);
});

await test("addresses: an address belongs to one partner; a replace drops what it no longer holds", async () => {
  const a = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "AddrA" });
  const b = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "AddrB" });
  await AD.setPartnerAddresses(a.id, [{ chainId: 4663, address: "0x00000000000000000000000000000000000a11d1" }]);
  await assert.rejects(AD.setPartnerAddresses(b.id, [{ chainId: 4663, address: "0x00000000000000000000000000000000000A11D1" }]), /already another partner's/);
  // the same address on another chain is another address
  await AD.setPartnerAddresses(b.id, [{ chainId: 8453, address: "0x00000000000000000000000000000000000a11d1" }]);
  await AD.setPartnerAddresses(a.id, [{ chainId: 4663, address: "0x00000000000000000000000000000000000a11d2" }]);
  await AD.setPartnerAddresses(b.id, [{ chainId: 4663, address: "0x00000000000000000000000000000000000a11d1" }]);
  const book = await AD.addressBook();
  assert.equal(book.get(4663)!.get("0x00000000000000000000000000000000000a11d1"), b.id);
  assert.equal(book.get(4663)!.get("0x00000000000000000000000000000000000a11d2"), a.id);
  assert.equal(book.get(8453)?.get("0x00000000000000000000000000000000000a11d1"), undefined, "b's replace dropped it");
  await AD.setPartnerAddresses(a.id, []);
  await AD.setPartnerAddresses(b.id, []);
  assert.equal(AD.countAddresses(await AD.getPartnerAddresses(a.id)), 0);
});

// ---------------------------------------------------------------- on-chain match

await test("match: deploy blocks are the ones in contracts/deployments", () => {
  const root = new URL("../../contracts/deployments/", import.meta.url);
  const main = JSON.parse(readFileSync(new URL("mainnet.json", root), "utf8")) as { chains: Record<string, { deployBlock: number }> };
  const base = JSON.parse(readFileSync(new URL("base-mainnet.json", root), "utf8")) as { contracts: { deployBlock: number } };
  const eth = JSON.parse(readFileSync(new URL("ethereum-mainnet.json", root), "utf8")) as { contracts: { deployBlock: number } };
  const want: Record<number, number> = { 4663: main.chains["4663"]!.deployBlock, 4217: main.chains["4217"]!.deployBlock, 8453: base.contracts.deployBlock, 1: eth.contracts.deployBlock };
  const chains = AD.addressChains();
  assert.deepEqual(chains.map((n) => n.chainId).sort(), [1, 4217, 4663, 8453]);
  for (const n of chains) assert.equal(n.deployBlock, BigInt(want[n.chainId]!), n.label);
  assert.equal(B.spanFor(RH), 5_000_000n);
  for (const n of chains) assert.equal(n.pool?.toLowerCase(), "0x39e28cde55cab798874746ac52cb4b5cc99a0194");
});

function fakeBackfill(opts: { head?: bigint; logs?: typeof FX.unshieldLogs; clock?: { t: number; step: number } } = {}) {
  const queries: { chainId: number; from: bigint; to: bigint }[] = [];
  const cursors = new Map<number, bigint>();
  const clock = opts.clock ?? { t: 1_000_000, step: 0 };
  const deps: import("../src/lib/partnerBackfill").BackfillDeps = {
    head: async (net) => (net.chainId === RH.chainId ? (opts.head ?? 105_000_000n) : net.deployBlock! + 10n),
    unshielded: async (net, from, to) => {
      queries.push({ chainId: net.chainId, from, to });
      if (net.chainId !== RH.chainId) return [];
      return (opts.logs ?? FX.unshieldLogs)
        .filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to)
        .map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber), amount: BigInt(l.amount) }));
    },
    receipt: (net, h) => live.receipt(net, h),
    blockTime: (net, b) => live.blockTime(net, b),
    partner: P.getPartner,
    record: P.recordActivity,
    attributed: P.attributedTo,
    readCursor: async (c) => cursors.get(c) ?? null,
    writeCursor: async (c, b) => void cursors.set(c, b),
    now: () => (clock.t += clock.step),
  };
  return { deps, queries, cursors };
}

const backfillPartner = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "Backfilled" });
const escrowOwner = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "EscrowClaimer" });
// a11c2 got two cash outs and a11c3 one; the swap's escrow is registered by someone too, to show a swap's leg never counts
resetClaims(FX.cashOuts);
const escrow = FX.unshieldLogs.find((l) => l.txHash === FX.swap)!.to;
const book = new Map([
  [
    RH.chainId,
    new Map([
      ["0x00000000000000000000000000000000000a11c2", backfillPartner.id],
      ["0x00000000000000000000000000000000000a11c3", backfillPartner.id],
      [escrow.toLowerCase(), escrowOwner.id],
    ]),
  ],
]);

await test("match: a dry run reads every mainnet from its deploy block in RPC-sized spans and writes nothing", async () => {
  resetClaims([...FX.cashOuts, FX.swap]);
  const { deps, queries, cursors } = fakeBackfill();
  const r = await B.runBackfill({ dryRun: true, from: "deploy", book, budgetMs: 60_000 }, deps);
  const rh = r.chains.find((c) => c.chainId === RH.chainId)!;
  assert.equal(rh.from, RH.deployBlock!.toString());
  assert.equal(rh.done, true);
  assert.equal(rh.queries, Number((105_000_000n - RH.deployBlock! + 5_000_000n) / 5_000_000n));
  for (const q of queries) assert.ok(q.to - q.from + 1n <= (q.chainId === RH.chainId ? 5_000_000n : getNetworkByChain(q.chainId).logRange));
  assert.deepEqual(r.chains.map((c) => c.chainId).sort(), [1, 4217, 4663, 8453]);
  const results = r.matches.map((m) => `${m.txHash.slice(0, 10)}:${m.result}`).sort();
  assert.deepEqual(results, ["0x171afa35:would_record", "0x34181c92:would_record", "0x6c5f6f65:refused", "0xe3a0f84d:would_record"].sort());
  assert.equal(r.matches.find((m) => m.txHash === FX.swap)!.reason, "Not a plain cash out.");
  assert.equal(cursors.size, 0, "no cursor moved");
  assert.equal((await P.readPartnerStats(backfillPartner.id)).totals.cashOuts, 0, "nothing counted");
  assert.match(r.swaps, /no swap on the live routers pays a public address/);
  assert.match(r.privatePayments, /payee and the amount are hidden/);
});

function getNetworkByChain(chainId: number) {
  return AD.addressChains().find((n) => n.chainId === chainId)!;
}

await test("match: a real pass counts each matched cash out once, as 'matched on chain', with its fee and its block's time", async () => {
  const { deps, cursors } = fakeBackfill();
  const r = await B.runBackfill({ dryRun: false, from: "deploy", book, budgetMs: 60_000 }, deps);
  assert.equal(r.matches.filter((m) => m.result === "recorded").length, 3);
  assert.equal(cursors.get(RH.chainId), 105_000_000n);
  const s = await P.readPartnerStats(backfillPartner.id, { recent: 10, days: 30 });
  assert.equal(s.totals.cashOuts, 3);
  assert.equal(s.bySource.chain.counts.cash_out, 3);
  assert.equal(s.bySource.api.counts.cash_out, 0);
  assert.equal(s.bySource.chain.volumeUsd, 80, "30 + 30 + 20 USDG");
  assert.ok(Math.abs(s.totals.vaultFeeUsd - 0.2) < 1e-9, "0.075 + 0.075 + 0.05 from each WithdrawFee log");
  for (const rec of s.recent) {
    assert.equal(rec.source, "chain");
    assert.equal(rec.ts, rcpt(rec.txHash).blockTimestamp * 1000);
  }
  assert.equal((await P.readPartnerStats(escrowOwner.id)).totals.cashOuts, 0, "a swap's escrow leg is no one's cash out");

  // again: nothing new, nothing twice
  const again = await B.runBackfill({ dryRun: false, from: "deploy", book, budgetMs: 60_000 }, fakeBackfill().deps);
  assert.equal(again.matches.filter((m) => m.result === "recorded").length, 0);
  assert.equal((await P.readPartnerStats(backfillPartner.id)).totals.cashOuts, 3);
  // and a link can't count one the match already did
  const recent = fakeChain(rhChain, rcpt(FX.cashOuts[1]!).blockTimestamp + 60);
  await throwsApi(A.attributeLinkTx({ code: motionCode, chainId: RH.chainId, txHash: FX.cashOuts[1]!, flow: "pay" }, recent), 409, "already_attributed");
});

await test("match: a transaction a link already counted is left to the link", async () => {
  resetClaims([...FX.cashOuts]);
  const p = await P.upsertPartner(privateKeyToAccount(generatePrivateKey()).address, { name: "LinkFirst" });
  const code = (await L.issueLinkCode({ partnerId: p.id, by: "admin" })).code;
  await A.attributeLinkTx({ code, chainId: RH.chainId, txHash: FX.cashOuts[3]!, flow: "pay" }, fakeChain(rhChain, rcpt(FX.cashOuts[3]!).blockTimestamp + 60));
  const r = await B.runBackfill({ dryRun: false, from: "deploy", book, budgetMs: 60_000 }, fakeBackfill().deps);
  assert.equal(r.matches.find((m) => m.txHash === FX.cashOuts[3]!.toLowerCase())!.result, "already_counted");
  assert.equal((await P.readPartnerStats(p.id)).bySource.link.counts.cash_out, 1);
});

await test("match: a pass stops at its time budget and the next one picks up at the cursor", async () => {
  resetClaims([...FX.cashOuts]);
  const clock = { t: 0, step: 1_000 };
  const f = fakeBackfill({ clock });
  const r1 = await B.runBackfill({ dryRun: false, from: "deploy", book, budgetMs: 2_500, chains: [RH.chainId] }, f.deps);
  const rh1 = r1.chains[0]!;
  assert.equal(rh1.done, false);
  assert.ok(rh1.queries >= 1 && rh1.queries < 3);
  const stop = f.cursors.get(RH.chainId)!;
  assert.equal(stop.toString(), rh1.scannedTo);
  clock.step = 0;
  const r2 = await B.runBackfill({ dryRun: false, from: "cursor", book, budgetMs: 60_000, chains: [RH.chainId] }, f.deps);
  assert.equal(r2.chains[0]!.from, (stop + 1n).toString());
  assert.equal(r2.chains[0]!.done, true);
});

await test("match: a chain whose RPC fails is reported, and the others still run", async () => {
  const f = fakeBackfill();
  const deps = { ...f.deps, unshielded: async (net: Parameters<typeof f.deps.unshielded>[0], a: bigint, b: bigint) => (net.chainId === 8453 ? Promise.reject(new Error("rpc down\nmore")) : f.deps.unshielded(net, a, b)) };
  const r = await B.runBackfill({ dryRun: true, from: "deploy", book, budgetMs: 60_000 }, deps);
  assert.equal(r.chains.find((c) => c.chainId === 8453)!.error, "rpc down");
  assert.equal(r.chains.find((c) => c.chainId === RH.chainId)!.done, true);
});

console.log(`\n${passed} partner attribution tests passed`);
