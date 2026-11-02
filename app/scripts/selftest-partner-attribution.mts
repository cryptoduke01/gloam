/**
 * Self-test: partner link codes, link attribution bound before the send, the
 * on-chain match, and partner analytics. Includes the PR 195 review's attacks
 * as regressions (F1 to F8).
 *
 *  - link codes: issue, revoke, live and total caps, revoked records expire; a
 *    forged, malformed, revoked or expired code, or one whose account is gone,
 *    counts for nobody
 *  - names: plain-name rules (no Gloam, no web address), the name in links only
 *    once an admin approved it, locked through a rename
 *  - links: `p=` rides in the pay and swap links' fragment; name and ref never count
 *  - the classifier on real Robinhood Chain mainnet receipts (recipients replaced
 *    with made-up addresses; scripts/fixtures/partner-attribution-rh.json)
 *  - binding: a wallet send counts only when registered before its block; a relay
 *    send is registered by the relay and counted once it lands; the earliest
 *    registration of a spend wins; nobody can claim a transaction afterwards
 *    (the review's steal, scheduled cash out and free-claim attacks); a scheduled
 *    cash out registered when scheduled; flows, chains, failed and old transactions
 *  - routes: register, attribute and lookup need the gloam.trade Origin (none is
 *    refused), take only their fields, and the per-code limit is per IP too
 *  - privacy: no wallet, recipient, IP or nullifier in the store; partners never
 *    see a private payment's hash; a cash out to a proven address goes to its owner
 *  - mainnet and testnet apart; testnet never valued; the daily CSV names networks
 *  - analytics by source, kind, asset and day; a claim reversed exactly; older
 *    activity replayed into the new counters once
 *  - receiving addresses proven by EIP-191 signatures; the on-chain match: dry run
 *    first, per-address results, moves a link's cash out to the address's owner,
 *    leaves an API key's, settles registered cash outs, holds its cursor on an
 *    unread receipt, stops at its budget; deploy blocks match contracts/deployments
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
import { verifyMessage, type Address, type Hex } from "viem";

const stubs: Record<string, string> = {
  "server-only": fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url)),
  "next/headers": fileURLToPath(new URL("./next-headers-stub.cjs", import.meta.url)),
};
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolveFilename = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return stubs[req] ?? resolveFilename.call(this, req, ...rest);
};

process.env.GLOAM_PARTNERS_STORE = "memory";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "test";
env.GLOAM_PARTNER_SESSION_SECRET = "s".repeat(48);
env.ADMIN_ACCESS_CODE = "a-long-random-admin-code-for-this-selftest";

const { resetMemoryKv, kv1, k } = await import("../src/lib/partnersKv");
const P = await import("../src/lib/partners");
const L = await import("../src/lib/partnerLinks");
const { classifyVaultTx, kindFitsFlow } = await import("../src/lib/partnerVerify");
const A = await import("../src/lib/partnerAttribution");
const B = await import("../src/lib/partnerBackfill");
const AD = await import("../src/lib/partnerAddresses");
const { linkNullifierHash } = await import("../src/lib/partnerCode");
const { getNetwork } = await import("../src/lib/networks");
const { swapRoutersOn, EVERY_SWAP_ROUTER } = await import("../src/lib/vaultSwap");
const { buildPaymentRequestLink, readPaymentRequest, requestParamsFrom, requestAssetsFor } = await import("../src/lib/paymentRequest");
const { buildSwapLink, swapLinkFromHash } = await import("../src/lib/swapLink");
const { ApiError } = await import("../src/lib/partnersApi");
const { createSession, SESSION_COOKIE } = await import("../src/lib/partnersAuth");
const { createAdminSession, ADMIN_COOKIE } = await import("../src/lib/adminAuth");
const { POST: attributePost } = await import("../src/app/api/partners/attribute/route");
const { POST: registerPost } = await import("../src/app/api/partners/register/route");
const { POST: lookupPost } = await import("../src/app/api/partners/link-code/route");
const { GET: statsGet } = await import("../src/app/api/partners/stats/route");
const { GET: exportGet } = await import("../src/app/api/partners/export/route");
const { POST: backfillPost } = await import("../src/app/api/partners/admin/backfill/route");

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
const RH_TEST = getNetwork("robinhood");
const HOST = "gloam.trade";

type Rcpt = { status: "success"; blockNumber: string; blockTimestamp: number; logs: { address: string; topics: string[]; data: string }[] };
type Fixture = {
  cashOuts: Hex[];
  privatePayment: Hex;
  swap: Hex;
  receipts: Record<string, Rcpt>;
  unshieldLogs: { txHash: Hex; blockNumber: string; nullifier: Hex; asset: Address; to: Address; amount: string }[];
};
const FX = JSON.parse(readFileSync(new URL("./fixtures/partner-attribution-rh.json", import.meta.url), "utf8")) as Fixture;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ctxRH = { pool: RH.pool!, routers: swapRoutersOn(RH.chainId).map((r) => r.address), anyRouter: EVERY_SWAP_ROUTER };
const rcpt = (h: Hex) => FX.receipts[h.toLowerCase()] ?? FX.receipts[h]!;
const nullifierOf = (h: Hex): Hex => {
  const f = classifyVaultTx(rcpt(h).logs, ctxRH);
  assert.ok(f.ok);
  return f.nullifier;
};
const wallet = () => privateKeyToAccount(generatePrivateKey()).address;

type Chain = Map<number, Map<string, Rcpt>>;
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
const after = (h: Hex, sec = 60) => fakeChain(rhChain, rcpt(h).blockTimestamp + sec);
const before = (h: Hex, sec = 30) => (rcpt(h).blockTimestamp - sec) * 1000;

function unclaim(hashes: Hex[]) {
  const g = globalThis as { __gloamPartnersMem?: Map<string, unknown> };
  for (const h of hashes) {
    g.__gloamPartnersMem?.delete(k("tx", RH.chainId, h.toLowerCase()));
    g.__gloamPartnersMem?.delete(k("txrec", RH.chainId, h.toLowerCase()));
  }
}
function unregister(hashes: Hex[]) {
  const g = globalThis as { __gloamPartnersMem?: Map<string, unknown> };
  for (const h of hashes) g.__gloamPartnersMem?.delete(k("reg", RH.chainId, linkNullifierHash(nullifierOf(h)).toLowerCase()));
}
const regApp = (code: string, h: Hex, flow: "pay" | "swap", at: number) =>
  A.registerLink({ chainId: RH.chainId, nullifierHash: linkNullifierHash(nullifierOf(h)), code, flow, via: "app", at });

const motionOwner = wallet();
const motion = await P.upsertPartner(motionOwner, { name: "Motion" });
const mallory = await P.upsertPartner(wallet(), { name: "Mallory" });

// ---------------------------------------------------------------- link codes (F4)

await test("codes: a partner and an admin each issue one; 20 letters and digits, unique, listed newest first", async () => {
  const a = await L.issueLinkCode({ partnerId: motion.id, label: "Fund button", by: "partner", now: 1_000 });
  const b = await L.issueLinkCode({ partnerId: motion.id, label: "  Swap‮page ", by: "admin", now: 2_000 });
  assert.match(a.code, /^[A-Za-z0-9]{20}$/);
  assert.equal(b.label, "Swap page", "a direction override is taken out of a label");
  assert.deepEqual((await L.listLinkCodes(motion.id)).map((c) => c.code), [b.code, a.code]);
  const seen = new Set(Array.from({ length: 2_000 }, () => L.generateLinkCode()));
  assert.equal(seen.size, 2_000);
});

await test("codes: revoke only by the owner (or an admin); revoking twice keeps the first time; a revoked record expires", async () => {
  const c = await L.issueLinkCode({ partnerId: motion.id, by: "partner" });
  assert.equal(await L.revokeLinkCode({ code: c.code, partnerId: mallory.id }), null, "another partner can't");
  const r = await L.revokeLinkCode({ code: c.code, partnerId: motion.id, now: 5_000 });
  assert.equal(r?.revokedAt, 5_000);
  assert.equal((await L.revokeLinkCode({ code: c.code, now: 9_000 }))?.revokedAt, 5_000);
  assert.equal(await L.resolveLinkCode(c.code), null);
  const g = globalThis as { __gloamPartnersMem?: Map<string, { exp: number | null }> };
  const exp = g.__gloamPartnersMem!.get(k("link", c.code))!.exp!;
  assert.ok(exp - Date.now() <= L.REVOKED_TTL_SEC * 1000 && exp - Date.now() > (L.REVOKED_TTL_SEC - 60) * 1000, "kept 30 days, then gone");
  assert.equal(await kv1(["SISMEMBER", k("links-live", motion.id), c.code]), 0, "out of the live set");
});

await test("codes: forged, malformed, expired and orphaned codes resolve to nobody", async () => {
  assert.equal(await L.resolveLinkCode(L.generateLinkCode()), null);
  for (const bad of ["", "short", "x".repeat(21), "abc$efghijklmnopqrst", null, 42]) assert.equal(await L.resolveLinkCode(bad), null);
  const t0 = Date.now();
  const e = await L.issueLinkCode({ partnerId: motion.id, expiresInDays: 1, by: "admin", now: t0 });
  assert.ok(await L.resolveLinkCode(e.code, t0 + 60_000));
  assert.equal(await L.resolveLinkCode(e.code, t0 + 86_400_000 + 1), null);
  for (const d of [0, -1, 1.5, 731, "x"]) await assert.rejects(L.issueLinkCode({ partnerId: motion.id, expiresInDays: d, by: "admin" }), /Expiry/);
  const ghost = await P.upsertPartner(wallet(), { name: "Ghost" });
  const g = await L.issueLinkCode({ partnerId: ghost.id, by: "admin" });
  await kv1(["DEL", k("partner", ghost.id)]);
  assert.equal(await L.resolveLinkCode(g.code), null);
});

await test("codes (F4): at most 20 live and 100 on record; revoked ones go, so the list stays bounded", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Churn" });
  const made = [];
  for (let i = 0; i < L.MAX_LIVE_CODES; i++) made.push(await L.issueLinkCode({ partnerId: p.id, by: "partner" }));
  await assert.rejects(L.issueLinkCode({ partnerId: p.id, by: "partner" }), /Revoke one first/);
  for (const c of made) await L.revokeLinkCode({ code: c.code, partnerId: p.id });
  for (let i = 0; i < L.MAX_CODES - L.MAX_LIVE_CODES; i++) {
    const c = await L.issueLinkCode({ partnerId: p.id, by: "partner" });
    await L.revokeLinkCode({ code: c.code, partnerId: p.id });
  }
  await assert.rejects(L.issueLinkCode({ partnerId: p.id, by: "partner" }), /100 link codes on record/);
  // revoked records expire; the list drops what is gone, and a new code can be made
  const g = globalThis as { __gloamPartnersMem?: Map<string, { exp: number | null }> };
  for (const c of made) g.__gloamPartnersMem!.delete(k("link", c.code));
  assert.equal((await L.listLinkCodes(p.id)).length, L.MAX_CODES - L.MAX_LIVE_CODES);
  assert.ok(await L.issueLinkCode({ partnerId: p.id, by: "partner" }));
});

// ---------------------------------------------------------------- names (F2)

await test("names (F2): plain names only: no Gloam, no web address, 32 characters and 4 words at most", async () => {
  for (const bad of ["Gloam Support", "gloam", "Gloam refunds gloam-help.xyz", "pay.example.com", "a very long name of five words", "<b>Acme</b>", "x".repeat(33)]) {
    assert.ok(P.partnerNameProblem(bad), bad);
    await assert.rejects(P.upsertPartner(wallet(), { name: bad }), /bad_name|Gloam|plain name|characters/, bad);
  }
  for (const ok of ["Motion", "Acme Pay", "Raeto", "Swap Desk 2"]) assert.equal(P.partnerNameProblem(ok), null, ok);
  // an account can't rename itself to Gloam either
  const owner = wallet();
  await P.upsertPartner(owner, { name: "Renamer" });
  await assert.rejects(P.upsertPartner(owner, { name: "Gloam Treasury" }), /Gloam/);
});

const lookup = (code: string, origin: string | null = `https://${HOST}`, ip = "203.0.113.9") =>
  lookupPost(
    new Request(`https://${HOST}/api/partners/link-code`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(origin ? { origin } : {}) },
      body: JSON.stringify({ code }),
    })
  );

await test("names (F2): the name shows only once an admin approves it, and stays locked through a rename", async () => {
  const owner = wallet();
  const p = await P.upsertPartner(owner, { name: "Robin Pay" });
  const c = (await L.issueLinkCode({ partnerId: p.id, by: "partner" })).code;
  const name = async () => ((await (await lookup(c)).json()) as { data: { name: string | null } }).data.name;
  assert.equal(await name(), null, "not approved: no name, no badge");
  await P.setApprovedName(p.id, true);
  assert.equal(await name(), "Robin Pay");
  await P.upsertPartner(owner, { name: "Robinhood" });
  assert.equal(await name(), "Robin Pay", "a rename keeps showing the approved name");
  const view = P.partnerView((await P.getPartner(p.id))!);
  assert.equal(view.nameAwaitingApproval, true);
  await P.setApprovedName(p.id, true);
  assert.equal(await name(), "Robinhood", "until an admin approves the new one");
  await P.setApprovedName(p.id, false);
  assert.equal(await name(), null);
});

await test("lookup route (F8): a POST from gloam.trade only; no Origin, another site and junk are refused", async () => {
  const c = (await L.issueLinkCode({ partnerId: motion.id, by: "partner" })).code;
  assert.equal((await lookup(c)).status, 200);
  assert.equal((await lookup(c, "https://www.gloam.trade")).status, 200);
  assert.equal((await lookup(c, null)).status, 403, "a missing Origin is refused");
  assert.equal((await lookup(c, "https://evil.example")).status, 403);
  assert.equal((await lookup(c, "http://gloam.trade")).status, 403, "not https");
  assert.equal((await lookup(L.generateLinkCode())).status, 404);
  assert.equal((await lookup("Motion")).status, 400);
});

// ---------------------------------------------------------------- links

await test("links: p= rides in the fragment of pay and swap links; name and ref are never a code", async () => {
  const code = L.generateLinkCode();
  const usdg = requestAssetsFor("robinhood-mainnet").find((a) => a.symbol === "USDG")!;
  const pay = buildPaymentRequestLink({ to: "0x00000000000000000000000000000000000A11c1", network: "robinhood-mainnet", asset: usdg, amount: "25", name: "Motion", partnerCode: code });
  const u = new URL(pay);
  assert.equal(u.searchParams.get("p"), null);
  assert.equal(new URLSearchParams(u.hash.slice(1)).get("p"), code);
  assert.equal(readPaymentRequest(requestParamsFrom(u.search, u.hash), "robinhood-mainnet")!.partnerCode, code);
  assert.equal(readPaymentRequest(new URLSearchParams("to=0x00000000000000000000000000000000000A11c1&p=Motion"), "robinhood-mainnet")!.partnerCode, null);
  const s = swapLinkFromHash(new URL(buildSwapLink({ from: "USDG", to: "GLOAM", amount: "100", network: "robinhood-mainnet", ref: "Motion", partnerCode: code })).hash, "robinhood-mainnet")!;
  assert.equal(s.partnerCode, code);
  assert.equal(swapLinkFromHash("#from=USDG&to=GLOAM&ref=Motion", "robinhood-mainnet")!.partnerCode, null);
});

// ---------------------------------------------------------------- classifier

await test("classifier: real Robinhood Chain receipts read as a cash out, a private payment and a vault swap, with their nullifiers", () => {
  const out = classifyVaultTx(rcpt(FX.cashOuts[0]!).logs, ctxRH);
  assert.ok(out.ok && out.kind === "cash_out");
  if (out.ok && out.kind === "cash_out") {
    assert.equal(out.amount, 2_000_000n);
    assert.equal(out.vaultFee, 5_000n);
    assert.equal(out.to?.toLowerCase(), "0x00000000000000000000000000000000000a11c1");
    assert.equal(out.nullifier, FX.unshieldLogs[0]!.nullifier);
  }
  const pp = classifyVaultTx(rcpt(FX.privatePayment).logs, ctxRH);
  assert.ok(pp.ok && pp.kind === "private_payment" && /^0x[0-9a-f]{64}$/.test(pp.nullifier));
  const sw = classifyVaultTx(rcpt(FX.swap).logs, ctxRH);
  assert.ok(sw.ok && sw.kind === "private_swap" && sw.amount === 2_000_000n && sw.vaultFee === 5_000n);
  assert.ok(kindFitsFlow("cash_out", "pay") && kindFitsFlow("private_payment", "pay") && !kindFitsFlow("private_swap", "pay"));
  assert.ok(kindFitsFlow("private_swap", "swap") && !kindFitsFlow("cash_out", "swap"));
});

await test("classifier: a random transaction, a refund, a stranger's VaultSwap event and packed actions are refused", () => {
  const swapLogs = rcpt(FX.swap).logs;
  const VS = "0x203409a826ec460170d80821c1fd8c52d787fe15820120cb738d54b9b3f9163b";
  assert.deepEqual(classifyVaultTx(rcpt(FX.cashOuts[0]!).logs.slice(0, 1), ctxRH), { ok: false, reason: "not_vault" });
  assert.deepEqual(classifyVaultTx(rcpt(FX.cashOuts[0]!).logs, { ...ctxRH, pool: "0x00000000000000000000000000000000000000aa" }), { ok: false, reason: "not_vault" });
  assert.deepEqual(classifyVaultTx(swapLogs.map((l) => (l.topics[0] === VS ? { ...l, address: "0x00000000000000000000000000000000000000bb" } : l)), ctxRH), { ok: false, reason: "unknown_router" });
  const refund = swapLogs.filter((l) => l.topics[0] !== VS && !(l.address.toLowerCase() === RH.pool!.toLowerCase() && l.topics.length === 4 && l.topics[0]!.startsWith("0xb2fce2f2")));
  assert.deepEqual(classifyVaultTx(refund, ctxRH), { ok: false, reason: "refund" });
  assert.deepEqual(classifyVaultTx([...rcpt(FX.cashOuts[0]!).logs, ...rcpt(FX.privatePayment).logs], ctxRH), { ok: false, reason: "mixed" });
});

// ---------------------------------------------------------------- binding (F1)

const motionCode = (await L.issueLinkCode({ partnerId: motion.id, label: "Fund", by: "partner" })).code;
const malloryCode = (await L.issueLinkCode({ partnerId: mallory.id, by: "partner" })).code;

await test("F1 fixed: nobody can claim a transaction that wasn't registered from their link, whoever asks first", async () => {
  // the review's steal: Mallory's watcher sees a vault log and asks for it to be counted
  const h = FX.cashOuts[0]!;
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h, 1)), 404, "not_registered");
  // registering it after it landed counts for nothing
  await regApp(malloryCode, h, "pay", (rcpt(h).blockTimestamp + 1) * 1000);
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h, 5)), 422, "registered_late");
  assert.equal(await P.attributedTo(RH.chainId, h), null);
  assert.equal((await P.readPartnerStats(mallory.id)).totals.cashOuts, 0);
});

await test("F1 fixed: a wallet send registered before its block counts to that link, whoever asks for the count", async () => {
  const h = FX.cashOuts[1]!;
  assert.deepEqual(await regApp(motionCode, h, "pay", before(h)), { registered: true });
  // Mallory registering the same spend later changes nothing: the earliest stands
  assert.equal((await regApp(malloryCode, h, "pay", before(h, 5))).registered, false);
  // anyone may ask for the count; the partner comes from the registration
  const r = await A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h));
  assert.equal(r.kind, "cash_out");
  assert.equal(r.record.source, "link");
  assert.equal(r.record.linkCode, motionCode);
  assert.equal(r.record.vaultFee, "75000");
  assert.equal(await P.attributedTo(RH.chainId, h), motion.id);
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h)), 409, "already_attributed");
});

await test("F1 fixed: a relay send is registered by the relay as of the request and counted when it lands", async () => {
  const h = FX.privatePayment;
  const tookAt = before(h, 3);
  // a racing registration made after the relay took the request (Mallory saw the transaction go by)
  await regApp(malloryCode, h, "pay", before(h, 1));
  const spend = A.relaySpendOf({ action: "transfer", nullifier: nullifierOf(h) });
  assert.deepEqual(spend, { flow: "pay", nullifier: nullifierOf(h) });
  let waited = 0;
  await A.afterRelaySend({ net: RH, hash: h, code: motionCode, spend, at: tookAt, wait: async () => void waited++, deps: after(h) });
  assert.equal(waited, 1);
  assert.equal(await P.attributedTo(RH.chainId, h), motion.id, "the relay's earlier registration wins");
  // what afterRelaySend reads, for each relay action
  assert.equal(A.relaySpendOf({ action: "memo" }), null);
  assert.equal(A.relaySpendOf({ action: "swap", spend: { nullifier: nullifierOf(FX.swap) }, unshieldTx: h }), null, "a refund is not a swap");
  assert.deepEqual(A.relaySpendOf({ action: "swap", spend: { nullifier: nullifierOf(FX.swap) } }), { flow: "swap", nullifier: nullifierOf(FX.swap) });
  // the swap, through the relay
  await A.afterRelaySend({ net: RH, hash: FX.swap, code: motionCode, spend: { flow: "swap", nullifier: nullifierOf(FX.swap) }, at: before(FX.swap), wait: async () => {}, deps: after(FX.swap) });
  assert.equal(await P.attributedTo(RH.chainId, FX.swap), motion.id);
  // a junk code or no spend: nothing happens, nothing throws
  await A.afterRelaySend({ net: RH, hash: FX.cashOuts[2]!, code: "nope", spend, at: Date.now(), wait: async () => assert.fail("not waited") });
});

await test("F1 fixed: a cash out scheduled for later is registered when scheduled and counted once sent", async () => {
  const h = FX.cashOuts[2]!;
  await A.registerScheduled({ chainId: RH.chainId, nullifier: nullifierOf(h), code: motionCode, at: before(h, 6 * 3600) });
  // reported the next day, inside the window
  const r = await A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h, 26 * 3600));
  assert.equal(r.record.source, "link");
  assert.equal(r.record.ts, rcpt(h).blockTimestamp * 1000, "counted on the day it landed");
});

await test("binding: flows must fit; other chains, random, failed and too-old transactions count for nothing", async () => {
  const h = FX.cashOuts[3]!;
  await regApp(motionCode, h, "swap", before(h));
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h)), 422, "wrong_flow");
  unregister([h]);
  await regApp(motionCode, h, "pay", before(h));
  const tempoChain = fakeChain(new Map([[TEMPO.chainId, new Map()]]), rcpt(h).blockTimestamp + 60);
  await throwsApi(A.settleLinkTx({ chainId: TEMPO.chainId, txHash: h }, tempoChain), 404, "tx_not_found");
  await throwsApi(A.settleLinkTx({ chainId: 999_999, txHash: h }, after(h)), 400, "bad_chain");
  const random = `0x${"ab".repeat(32)}` as Hex;
  const withRandom: Chain = new Map([[RH.chainId, new Map([...rhChain.get(RH.chainId)!, [random, { ...rcpt(h), logs: rcpt(h).logs.slice(0, 1) }]])]]);
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: random }, fakeChain(withRandom, rcpt(h).blockTimestamp + 60)), 422, "not_vault_action");
  const failed: Chain = new Map([[RH.chainId, new Map([[h.toLowerCase(), { ...rcpt(h), status: "reverted" as never }]])]]);
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, fakeChain(failed, rcpt(h).blockTimestamp + 60)), 422, "tx_failed");
  await throwsApi(A.settleLinkTx({ chainId: RH.chainId, txHash: h }, after(h, A.ATTRIBUTION_WINDOW_SEC + 1)), 422, "too_old");
  // a revoked or expired code can't register
  const gone = await L.issueLinkCode({ partnerId: motion.id, by: "partner" });
  await L.revokeLinkCode({ code: gone.code, partnerId: motion.id });
  assert.deepEqual(await A.registerLink({ chainId: RH.chainId, nullifierHash: `0x${"11".repeat(32)}`, code: gone.code, flow: "pay", via: "app" }), { registered: false, reason: "code_not_live" });
  unregister([h]);
});

// ---------------------------------------------------------------- routes (F1, F5)

const routeReq = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://${HOST}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: `https://${HOST}`, "x-forwarded-for": "203.0.113.77", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

await test("routes: register and attribute need the gloam.trade Origin; a missing one is refused", async () => {
  const reg = { chainId: RH.chainId, nullifierHash: `0x${"22".repeat(32)}`, code: motionCode, flow: "pay" };
  const noOrigin = new Request(`https://${HOST}/api/partners/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reg) });
  assert.equal((await registerPost(noOrigin as never)).status, 403);
  assert.equal((await registerPost(routeReq("/api/partners/register", reg, { origin: "https://evil.example" }) as never)).status, 403);
  assert.equal((await registerPost(routeReq("/api/partners/register", reg) as never)).status, 201);
  assert.equal((await registerPost(routeReq("/api/partners/register", { ...reg, wallet: "0x1" }) as never)).status, 400, "extra fields refused");
  assert.equal((await registerPost(routeReq("/api/partners/register", { ...reg, code: L.generateLinkCode() }) as never)).status, 404);
  const settleNoOrigin = new Request(`https://${HOST}/api/partners/attribute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId: 4663, txHash: FX.cashOuts[0] }) });
  assert.equal((await attributePost(settleNoOrigin as never)).status, 403);
  assert.equal((await attributePost(routeReq("/api/partners/attribute", { chainId: 4663, txHash: FX.cashOuts[0], code: motionCode }) as never)).status, 400, "the partner never comes from the request");
  // already counted: answered from the store, no chain read
  const dup = await attributePost(routeReq("/api/partners/attribute", { chainId: 4663, txHash: FX.cashOuts[1] }) as never);
  assert.equal(dup.status, 409);
});

await test("routes (F5): one IP spending a code's registrations doesn't block that code for anyone else", async () => {
  const c = (await L.issueLinkCode({ partnerId: motion.id, by: "partner" })).code;
  const send = (ip: string, n: number) =>
    registerPost(routeReq("/api/partners/register", { chainId: RH.chainId, nullifierHash: `0x${n.toString(16).padStart(64, "0")}`, code: c, flow: "pay" }, { "x-forwarded-for": ip }) as never);
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await send("198.51.100.1", 1000 + i)).status === 429) limited++;
  assert.ok(limited > 0, "one IP is held to its share");
  assert.equal((await send("198.51.100.2", 5000)).status, 201, "another IP still registers for the same code");
});

// ---------------------------------------------------------------- privacy (F3)

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

await test("privacy: no payer wallet, cash-out recipient, IP or nullifier anywhere in the partner store", async () => {
  const text = storeText();
  for (const fake of ["0x00000000000000000000000000000000000a11c1", "0x00000000000000000000000000000000000a11c2", "a11c3"]) assert.ok(!text.includes(fake), fake);
  for (const ip of ["203.0.113.77", "198.51.100.1", "203.0.113.9"]) assert.ok(!text.includes(ip), ip);
  for (const h of [...FX.cashOuts, FX.privatePayment]) assert.ok(!text.includes(nullifierOf(h).slice(2)), "only a hash of a spend is kept");
  assert.ok(!text.includes(FX.unshieldLogs.find((l) => l.txHash === FX.swap)!.to.toLowerCase()), "nor a swap's escrow");
});

const HOSTH = { "x-forwarded-host": HOST };
const sessionCookie = (owner: Address) => `${SESSION_COOKIE}=${encodeURIComponent(createSession(owner, HOST)!)}`;

await test("privacy (F3): a partner never sees a private payment's hash or code; cash outs and swaps stay listed", async () => {
  const res = await statsGet(new Request(`https://${HOST}/api/partners/stats`, { headers: { ...HOSTH, cookie: sessionCookie(motionOwner) } }) as never);
  const body = await res.text();
  const j = JSON.parse(body) as { data: { totals: { privatePayments: number }; recent: { kind: string; txHash: string }[] } };
  assert.equal(j.data.totals.privatePayments, 1, "counted");
  assert.ok(!j.data.recent.some((r) => r.kind === "private_payment"), "never listed one by one");
  assert.ok(!body.toLowerCase().includes(FX.privatePayment.toLowerCase()), "its hash is nowhere in the answer");
  assert.ok(j.data.recent.some((r) => r.kind === "cash_out"));
  const csv = await (await exportGet(new Request(`https://${HOST}/api/partners/export?type=transactions`, { headers: { ...HOSTH, cookie: sessionCookie(motionOwner) } }) as never)).text();
  assert.ok(!csv.toLowerCase().includes(FX.privatePayment.toLowerCase()));
  assert.ok(!/Private payment/.test(csv));
  const daily = await (await exportGet(new Request(`https://${HOST}/api/partners/export?type=daily`, { headers: { ...HOSTH, cookie: sessionCookie(motionOwner) } }) as never)).text();
  assert.ok(/Private payment,1,Hidden/.test(daily), "a daily count only");
});

await test("privacy: a cash out to a partner's proven address goes to that partner, whichever link it came from", async () => {
  const owner = privateKeyToAccount(generatePrivateKey());
  const shop = await P.upsertPartner(owner.address, { name: "Shop" });
  // the shop proves its receiving address (a fresh key standing in for it)
  const recv = privateKeyToAccount(generatePrivateKey());
  await AD.setPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address }], "add");
  const list = await AD.getPartnerAddresses(shop.id);
  const msg = list[String(RH.chainId)]![recv.address.toLowerCase()]!.message;
  await AD.verifyPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address, signature: await recv.signMessage({ message: msg }) }], async (_n, a, m, s) => verifyMessage({ address: a, message: m, signature: s }));
  // a cash out from Mallory's link that pays the shop's address (the fixture's recipient, swapped for the shop's)
  const h = FX.cashOuts[3]!;
  const word = (a: string) => `0x${a.toLowerCase().slice(2).padStart(64, "0")}`;
  const paysShop: Rcpt = { ...rcpt(h), logs: rcpt(h).logs.map((l) => ({ ...l, topics: l.topics.map((t) => (t === word("0x00000000000000000000000000000000000a11c2") ? word(recv.address) : t)) })) };
  const chain: Chain = new Map([[RH.chainId, new Map([[h.toLowerCase(), paysShop]])]]);
  await regApp(malloryCode, h, "pay", before(h));
  const r = await A.settleLinkTx({ chainId: RH.chainId, txHash: h }, fakeChain(chain, rcpt(h).blockTimestamp + 60));
  assert.equal(r.record.source, "chain");
  assert.equal(await P.attributedTo(RH.chainId, h), shop.id);
  unclaim([h]);
  unregister([h]);
  await AD.setPartnerAddresses(shop.id, [], "replace");
});

// ---------------------------------------------------------------- tiers (F6)

await test("F6 fixed: testnet is counted apart and never valued; the daily CSV names each network", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Wash" });
  const usd = requestAssetsFor("robinhood").find((a) => a.stable)!;
  const t = await P.recordActivity({ partner: p, keyId: null, source: "link", network: RH_TEST, kind: "cash_out", txHash: `0x${"cd".repeat(32)}`, edge: { asset: usd.address, amount: 1_000_000n * 10n ** BigInt(usd.decimals) }, vaultFee: 2_500n * 10n ** BigInt(usd.decimals) });
  assert.ok(t.recorded && t.record.volumeUsd === null && t.record.vaultFeeUsd === null);
  const main = await P.readPartnerStats(p.id, { days: 2 });
  assert.equal(main.totals.cashOuts, 0);
  assert.equal(main.totals.publicVolumeUsd, 0);
  const test = await P.readPartnerStats(p.id, { days: 2, tier: "testnet" });
  assert.equal(test.totals.cashOuts, 1);
  assert.equal(test.totals.publicVolumeUsd, 0);
  assert.equal(test.totals.vaultFeeUsd, 0);
  assert.equal(test.totals.unpriced, 1);
  const csv = P.dailyCsv([{ id: p.id, name: p.name, daily: test.daily }]).trim().split("\r\n");
  assert.equal(csv[0], "Date (UTC),Network,Partner id,Partner,Source,Kind,Count,Volume (USD),Vault fee (USD)");
  assert.ok(csv[1]!.includes(",Robinhood Chain testnet,") && csv[1]!.endsWith(",Not priced,Not priced"), csv[1]);
  assert.equal(P.dailyCsv([{ id: p.id, name: p.name, daily: main.daily }]).trim().split("\r\n").length, 1, "no testnet row in the mainnet file");
});

// ---------------------------------------------------------------- analytics

await test("analytics: totals by source, kind, asset and day, with the vault's fee", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Sums" });
  const T = (n: number) => `0x${(n + 9000).toString(16).padStart(64, "0")}` as Hex;
  const day = Date.UTC(2026, 9, 30, 12);
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "cash_out", txHash: T(1), edge: { asset: USDG, amount: 100_000_000n }, vaultFee: 250_000n });
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "private_payment", txHash: T(2) });
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "private_swap", txHash: T(3), edge: { asset: USDG, amount: 40_000_000n }, vaultFee: 100_000n });
  await P.recordActivity({ partner: p, keyId: null, source: "link", linkCode: motionCode, network: RH, kind: "cash_out", txHash: T(4), edge: { asset: USDG, amount: 20_000_000n }, vaultFee: 50_000n });
  await P.recordActivity({ partner: p, keyId: "ignored", source: "link", network: RH, kind: "private_payment", txHash: T(5) });
  await P.recordActivity({ partner: p, keyId: null, source: "chain", network: RH, kind: "cash_out", txHash: T(6), edge: { asset: USDG, amount: 30_000_000n }, vaultFee: 75_000n, now: day });
  await P.recordActivity({ partner: p, keyId: "key_1", network: RH, kind: "deposit", txHash: T(7), edge: { asset: USDG, amount: 10_000_000n }, vaultFee: 999n });
  const s = await P.readPartnerStats(p.id, { recent: 20, days: 30 });
  assert.equal(s.totals.cashOuts, 3);
  assert.equal(s.totals.privatePayments, 2);
  assert.equal(s.totals.publicVolumeUsd, 160);
  assert.equal(s.totals.swapVolumeUsd, 40);
  assert.ok(Math.abs(s.totals.vaultFeeUsd - 0.475) < 1e-9);
  assert.deepEqual(s.bySource.api.counts, { private_payment: 1, cash_out: 1, deposit: 1, private_swap: 1 });
  assert.deepEqual(s.bySource.link.counts, { private_payment: 1, cash_out: 1, deposit: 0, private_swap: 0 });
  assert.deepEqual(s.bySource.chain.counts, { private_payment: 0, cash_out: 1, deposit: 0, private_swap: 0 });
  assert.equal(s.bySource.api.volumeUsd, 150);
  assert.ok(Math.abs(s.bySource.link.vaultFeeUsd - 0.05) < 1e-9);
  const usdg = s.byAsset.find((a) => a.symbol === "USDG")!;
  assert.deepEqual([usdg.volume, usdg.swapVolume, usdg.vaultFee], ["160", "40", "0.475"]);
  const back = s.daily.find((d) => d.day === "2026-10-30");
  if (back) assert.equal(back.bySource.chain.counts.cash_out, 1, "a past match is counted on its own day");
  assert.ok(s.lastActivity! > day, "a past match never moves last back");
  assert.ok(s.recent.every((r, i) => i === 0 || s.recent[i - 1]!.ts >= r.ts));
  const rows = s.daily.find((d) => d.day === P.utcDay(Date.now()))!.rows;
  assert.ok(rows.some((r) => r.network === "robinhood-mainnet" && r.source === "link" && r.kind === "cash_out" && r.count === 1 && r.volumeUsd === 20));
});

await test("analytics: a claim is taken back exactly, and older activity is replayed into the new counters once", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Undo" });
  const h = `0x${"ef".repeat(32)}` as Hex;
  const before0 = await kv1(["HGETALL", k("stats2", p.id)]);
  await P.recordActivity({ partner: p, keyId: null, source: "link", linkCode: motionCode, network: RH, kind: "cash_out", txHash: h, edge: { asset: USDG, amount: 7_000_000n }, vaultFee: 17_500n });
  const back = await P.reverseActivity(RH.chainId, h);
  assert.equal(back?.partnerId, p.id);
  const s = await P.readPartnerStats(p.id, { recent: 5 });
  assert.equal(s.totals.cashOuts, 0);
  assert.equal(s.totals.publicVolumeUsd, 0);
  assert.equal(s.recent.length, 0);
  assert.equal(await P.attributedTo(RH.chainId, h), null, "the claim is free again");
  assert.deepEqual(before0, []);

  // an account counted the old way: its list of records (no v) and v1 counters
  const old = await P.upsertPartner(wallet(), { name: "Legacy" });
  const rec = (n: number, network: string, kind: string, amount: string | null) =>
    JSON.stringify({ id: `act_${n}`, kind, network, chainId: getNetwork(network as never).chainId, txHash: `0x${n.toString(16).padStart(64, "0")}`, ts: Date.now() - n * 1000, keyId: "k", asset: amount ? USDG : null, symbol: amount ? "USDG" : null, decimals: amount ? 6 : null, amount, volumeUsd: amount ? Number(amount) / 1e6 : null, feeUsd: 0, feeToken: amount ? "0" : null, feeBasis: "" });
  await kv1(["LPUSH", k("events", old.id), rec(1, "robinhood-mainnet", "cash_out", "5000000"), rec(2, "robinhood", "cash_out", "9000000"), rec(3, "tempo-mainnet", "private_payment", null)]);
  await kv1(["HSET", k("stats", old.id), "n:cash_out", "3", "n:private_payment", "1"]);
  const m = await P.readPartnerStats(old.id);
  assert.equal(m.totals.cashOuts, 1);
  assert.equal(m.totals.privatePayments, 1);
  assert.equal(m.totals.publicVolumeUsd, 5);
  assert.equal(m.bySource.api.counts.cash_out, 1, "older activity came in with a key");
  assert.equal((await P.readPartnerStats(old.id, { tier: "testnet" })).totals.cashOuts, 1);
  assert.equal(await P.migrationNote(old.id), "partial:1", "one older cash out fell out of the list");
  assert.equal((await P.readPartnerStats(old.id)).totals.cashOuts, 1, "replayed once only");
});

await test("CSV: one row per transaction, formula cells defused", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Sheet" });
  await P.recordActivity({ partner: p, keyId: null, source: "link", network: RH, kind: "cash_out", txHash: `0x${"a1".repeat(32)}`, edge: { asset: USDG, amount: 12_500_000n }, vaultFee: 31_250n });
  const s = await P.readPartnerStats(p.id, { recent: 10, days: 1 });
  const tx = P.activityCsv([{ id: p.id, name: "=HYPERLINK(1)", recent: s.recent }]).trim().split("\r\n");
  assert.equal(tx[0], "Time (UTC),Partner id,Partner,Source,Network,Chain id,Kind,Transaction,Token,Token address,Amount,Volume (USD),Vault fee,Vault fee (USD)");
  const out = tx[1]!.split(",");
  assert.equal(out[2], "'=HYPERLINK(1)");
  assert.deepEqual([out[3], out[4], out[8], out[10], out[12]], ["Via link", "Robinhood Chain", "USDG", "12.5", "0.03125"]);
  assert.equal(P.csvCell('a"b,c'), '"a""b,c"');
});

// ---------------------------------------------------------------- receiving addresses (F7)

await test("addresses: pasted lines and CSVs with optional signatures; testnets refused", () => {
  const sig = `0x${"ab".repeat(65)}`;
  const r = AD.parseAddressList(
    ["chain,address", "robinhood-mainnet,0x00000000000000000000000000000000000A11c2", `Tempo; 0x00000000000000000000000000000000000a11c9, ${sig}`, "robinhood,0x00000000000000000000000000000000000a11cc", "0x52908400098527886e0F7030069857D2E4169ee7", "not an address"].join("\n"),
    4663
  );
  assert.deepEqual(
    r.entries.map((e) => `${e.chainId}:${e.address}:${e.signature ? "sig" : ""}`),
    ["4663:0x00000000000000000000000000000000000a11c2:", "4217:0x00000000000000000000000000000000000a11c9:sig"]
  );
  assert.ok(r.rejected.some((x) => /not a mainnet/.test(x.reason)));
  assert.ok(r.rejected.some((x) => /checksum/.test(x.reason)));
});

await test("F7 fixed: an address counts only once it signs its message; nobody else can take it", async () => {
  const shop = await P.upsertPartner(wallet(), { name: "Proven" });
  const rival = await P.upsertPartner(wallet(), { name: "Rival" });
  const recv = privateKeyToAccount(generatePrivateKey());
  const check: import("../src/lib/partnerAddresses").SignatureCheck = async (_n, a, m, s) => verifyMessage({ address: a, message: m, signature: s });
  await AD.setPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address }], "add");
  await AD.setPartnerAddresses(rival.id, [{ chainId: RH.chainId, address: recv.address }], "add");
  assert.equal((await AD.addressBook()).get(RH.chainId)?.get(recv.address.toLowerCase()), undefined, "waiting: matches nothing");
  const msg = (await AD.getPartnerAddresses(shop.id))[String(RH.chainId)]![recv.address.toLowerCase()]!.message;
  assert.match(msg, /Partner: Proven \(ptr_/);
  assert.match(msg, /Chain: Robinhood Chain \(4663\)/);
  assert.match(msg, new RegExp(`Date: ${P.utcDay(Date.now())}`));
  // a signature from another key, or of another message, is refused
  const stranger = privateKeyToAccount(generatePrivateKey());
  const bad = await AD.verifyPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address, signature: await stranger.signMessage({ message: msg }) }], check);
  assert.equal(bad.results[0]!.ok, false);
  const wrongMsg = await AD.verifyPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address, signature: await recv.signMessage({ message: "something else" }) }], check);
  assert.equal(wrongMsg.results[0]!.ok, false);
  const good = await AD.verifyPartnerAddresses(shop.id, [{ chainId: RH.chainId, address: recv.address, signature: await recv.signMessage({ message: msg }) }], check);
  assert.equal(good.results[0]!.ok, true);
  assert.equal((await AD.addressBook()).get(RH.chainId)?.get(recv.address.toLowerCase()), shop.id);
  // the rival, even with a valid signature of its own message, can't take a proven address
  const rivalMsg = (await AD.getPartnerAddresses(rival.id))[String(RH.chainId)]![recv.address.toLowerCase()]!.message;
  const taken = await AD.verifyPartnerAddresses(rival.id, [{ chainId: RH.chainId, address: recv.address, signature: await recv.signMessage({ message: rivalMsg }) }], check);
  assert.match(taken.results[0]!.reason ?? "", /Another partner already proved/);
  // dropped from the list: stops counting at once
  await AD.setPartnerAddresses(shop.id, [], "replace");
  assert.equal(await AD.addressOwner(RH.chainId, recv.address), null);
  await AD.setPartnerAddresses(rival.id, [], "replace");
});

// ---------------------------------------------------------------- the on-chain match

await test("match: deploy blocks are the ones in contracts/deployments", () => {
  const root = new URL("../../contracts/deployments/", import.meta.url);
  const main = JSON.parse(readFileSync(new URL("mainnet.json", root), "utf8")) as { chains: Record<string, { deployBlock: number }> };
  const base = JSON.parse(readFileSync(new URL("base-mainnet.json", root), "utf8")) as { contracts: { deployBlock: number } };
  const eth = JSON.parse(readFileSync(new URL("ethereum-mainnet.json", root), "utf8")) as { contracts: { deployBlock: number } };
  const want: Record<number, number> = { 4663: main.chains["4663"]!.deployBlock, 4217: main.chains["4217"]!.deployBlock, 8453: base.contracts.deployBlock, 1: eth.contracts.deployBlock };
  for (const n of AD.addressChains()) assert.equal(n.deployBlock, BigInt(want[n.chainId]!), n.label);
  assert.equal(B.spanFor(RH), 5_000_000n);
});

function fakeBackfill(opts: { head?: bigint; clock?: { t: number; step: number }; receipt?: (h: Hex) => Rcpt | null | undefined } = {}) {
  const cursors = new Map<number, bigint>();
  const queries: { chainId: number; from: bigint; to: bigint }[] = [];
  const clock = opts.clock ?? { t: 1_000_000, step: 0 };
  const live = fakeChain(rhChain, Math.max(...Object.values(FX.receipts).map((r) => r.blockTimestamp)) + 600);
  const deps: import("../src/lib/partnerBackfill").BackfillDeps = {
    ...B.backfillDeps,
    head: async (net) => (net.chainId === RH.chainId ? (opts.head ?? 105_000_000n) : net.deployBlock! + 10n),
    unshielded: async (net, from, to) => {
      queries.push({ chainId: net.chainId, from, to });
      if (net.chainId !== RH.chainId) return [];
      return FX.unshieldLogs
        .filter((l) => BigInt(l.blockNumber) >= from && BigInt(l.blockNumber) <= to)
        .map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber), amount: BigInt(l.amount) }));
    },
    receipt: async (net, h) => {
      if (opts.receipt) {
        const r = opts.receipt(h);
        if (r === null) return null;
      }
      return live.receipt(net, h);
    },
    blockTime: (net, b) => live.blockTime(net, b),
    settle: async (net, h) => void (await A.settleLinkTx({ chainId: net.chainId, txHash: h }, live)),
    readCursor: async (c) => cursors.get(c) ?? null,
    writeCursor: async (c, b) => void cursors.set(c, b),
    now: () => (clock.t += clock.step),
  };
  return { deps, cursors, queries };
}

async function proveAddress(partnerId: string, address: string) {
  // the fixture's recipients have no keys: prove them with a signature check that accepts this test's marker
  await AD.setPartnerAddresses(partnerId, [{ chainId: RH.chainId, address }], "add");
  await AD.verifyPartnerAddresses(partnerId, [{ chainId: RH.chainId, address, signature: `0x${"aa".repeat(65)}` }], async () => true);
}

await test("match (F7): a dry run reads every mainnet from its deploy block, writes nothing, and shows what it found per address", async () => {
  unclaim([...FX.cashOuts, FX.swap, FX.privatePayment]);
  const shop = await P.upsertPartner(wallet(), { name: "Backfilled" });
  await proveAddress(shop.id, "0x00000000000000000000000000000000000a11c2");
  await proveAddress(shop.id, "0x00000000000000000000000000000000000a11c3");
  const book = await AD.addressBook();
  const { deps, cursors, queries } = fakeBackfill();
  const r = await B.runBackfill({ dryRun: true, from: "deploy", book, budgetMs: 60_000 }, deps);
  assert.deepEqual(r.chains.map((c) => c.chainId).sort(), [1, 4217, 4663, 8453]);
  assert.equal(r.chains.find((c) => c.chainId === RH.chainId)!.from, RH.deployBlock!.toString());
  for (const q of queries) assert.ok(q.to - q.from + 1n <= (q.chainId === RH.chainId ? 5_000_000n : AD.addressChains().find((n) => n.chainId === q.chainId)!.logRange));
  const mine = r.byAddress.filter((a) => a.partnerId === shop.id);
  assert.deepEqual(mine.map((a) => `${a.address.slice(-5)}:${a.matches}:${a.counted}:${a.byToken.USDG}`).sort(), ["a11c2:2:2:60", "a11c3:1:1:20"]);
  assert.equal(cursors.size, 0);
  assert.equal((await P.readPartnerStats(shop.id)).totals.cashOuts, 0);
  assert.ok(r.matches.every((m) => m.result.startsWith("would_")));
});

await test("match (F7): the admin route refuses a real pass until a dry run of the same addresses ran", async () => {
  const jar = globalThis as { __testCookies?: Record<string, string> };
  jar.__testCookies = { [ADMIN_COOKIE]: createAdminSession()! };
  const res = await backfillPost(
    new Request(`https://${HOST}/api/partners/admin/backfill`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: `https://${HOST}`, "x-forwarded-host": HOST },
      body: JSON.stringify({ dryRun: false, from: "deploy" }),
    }) as never
  );
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "dry_run_first");
  jar.__testCookies = {};
});

await test("match: a real pass counts each matched cash out once, moves a link's claim to the address's owner, leaves an API key's", async () => {
  const shop = (await P.listPartners()).find((p) => p.name === "Backfilled")!;
  // [1] paid a11c2 and Motion's link counted it before the shop proved that address (a count made
  // now would already go to the shop: see "privacy: a cash out to a partner's proven address");
  // [3] paid a11c2 and was relayed with Mallory's API key
  assert.equal(await P.attributedTo(RH.chainId, FX.cashOuts[1]!), null);
  await P.recordActivity({ partner: motion, keyId: null, source: "link", linkCode: motionCode, network: RH, kind: "cash_out", txHash: FX.cashOuts[1]!, edge: { asset: USDG, amount: 30_000_000n }, vaultFee: 75_000n, now: rcpt(FX.cashOuts[1]!).blockTimestamp * 1000 });
  await P.recordActivity({ partner: mallory, keyId: "key_m", network: RH, kind: "cash_out", txHash: FX.cashOuts[3]!, edge: { asset: USDG, amount: 30_000_000n }, vaultFee: 75_000n });
  const motionBefore = (await P.readPartnerStats(motion.id)).bySource.link.counts.cash_out;
  const { deps, cursors } = fakeBackfill();
  const r = await B.runBackfill({ dryRun: false, from: "deploy", book: await AD.addressBook(), budgetMs: 60_000 }, deps);
  const by = (h: Hex) => r.matches.find((m) => m.txHash === h.toLowerCase())!;
  assert.equal(by(FX.cashOuts[1]!).result, "moved");
  assert.equal(by(FX.cashOuts[1]!).from, motion.id);
  assert.equal(by(FX.cashOuts[2]!).result, "recorded");
  assert.equal(by(FX.cashOuts[3]!).result, "already_counted", "an API key's stays");
  assert.equal(await P.attributedTo(RH.chainId, FX.cashOuts[1]!), shop.id);
  assert.equal((await P.readPartnerStats(motion.id)).bySource.link.counts.cash_out, motionBefore - 1, "taken back from the link's partner exactly");
  const s = await P.readPartnerStats(shop.id, { recent: 10 });
  assert.equal(s.bySource.chain.counts.cash_out, 2);
  assert.ok(Math.abs(s.totals.vaultFeeUsd - 0.125) < 1e-9, "0.075 + 0.05 from the WithdrawFee logs");
  assert.equal(cursors.get(RH.chainId), 105_000_000n);
  // again: nothing new
  const again = await B.runBackfill({ dryRun: false, from: "deploy", book: await AD.addressBook(), budgetMs: 60_000 }, fakeBackfill().deps);
  assert.ok(again.matches.every((m) => m.result === "already_counted" || m.via === "link"));
});

await test("match: a cash out registered from a link that nobody counted is settled to its link", async () => {
  // [0] paid a11c1, no partner's address; registered from Motion's link when it was scheduled
  unclaim([FX.cashOuts[0]!]);
  unregister([FX.cashOuts[0]!]);
  await A.registerScheduled({ chainId: RH.chainId, nullifier: nullifierOf(FX.cashOuts[0]!), code: motionCode, at: before(FX.cashOuts[0]!) });
  const r = await B.runBackfill({ dryRun: false, from: "deploy", book: await AD.addressBook(), budgetMs: 60_000, chains: [RH.chainId] }, fakeBackfill().deps);
  const m = r.matches.find((x) => x.txHash === FX.cashOuts[0]!.toLowerCase())!;
  assert.equal(m.via, "link");
  assert.equal(m.result, "settled");
  assert.equal(await P.attributedTo(RH.chainId, FX.cashOuts[0]!), motion.id);
});

await test("match (F8): a receipt that can't be read holds the cursor before its span", async () => {
  unclaim([FX.cashOuts[2]!]);
  const f = fakeBackfill({ receipt: (h) => (h.toLowerCase() === FX.cashOuts[2]!.toLowerCase() ? null : undefined) });
  const r = await B.runBackfill({ dryRun: false, from: "deploy", book: await AD.addressBook(), budgetMs: 60_000, chains: [RH.chainId] }, f.deps);
  const rh = r.chains[0]!;
  assert.equal(rh.done, false);
  assert.match(rh.error ?? "", /receipt could not be read/);
  const held = f.cursors.get(RH.chainId) ?? RH.deployBlock! - 1n;
  assert.ok(held < BigInt(rcpt(FX.cashOuts[2]!).blockNumber), "the cursor stays before the unread receipt");
  // the next pass, from the cursor, reads it
  const r2 = await B.runBackfill({ dryRun: false, from: "cursor", book: await AD.addressBook(), budgetMs: 60_000, chains: [RH.chainId] }, { ...fakeBackfill().deps, readCursor: f.deps.readCursor, writeCursor: f.deps.writeCursor });
  assert.equal(r2.chains[0]!.done, true);
  assert.equal(r2.matches.find((x) => x.txHash === FX.cashOuts[2]!.toLowerCase())!.result, "recorded");
});

await test("match: a pass stops at its time budget and the next one picks up at the cursor", async () => {
  const clock = { t: 0, step: 1_000 };
  const f = fakeBackfill({ clock });
  const r1 = await B.runBackfill({ dryRun: false, from: "deploy", book: await AD.addressBook(), budgetMs: 2_500, chains: [RH.chainId] }, f.deps);
  assert.equal(r1.chains[0]!.done, false);
  clock.step = 0;
  const r2 = await B.runBackfill({ dryRun: false, from: "cursor", book: await AD.addressBook(), budgetMs: 60_000, chains: [RH.chainId] }, f.deps);
  assert.equal(r2.chains[0]!.from, (f.cursors.get(RH.chainId)! >= 0n ? BigInt(r1.chains[0]!.scannedTo) + 1n : 0n).toString());
  assert.equal(r2.chains[0]!.done, true);
});

console.log(`\n${passed} partner attribution tests passed`);
