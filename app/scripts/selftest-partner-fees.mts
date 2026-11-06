/**
 * Self-test: partner interface fees (lib/partnerFeeMath, lib/partnerFees).
 *
 *  - the fee math: a flat fee in cents on dollar stablecoins only, a share in
 *    basis points rounded down, no fee on swaps
 *  - what the app adds on a link: only for an approved name, with a Gloam address
 *    for fees on that network (by network key or by chain), and a fee above 0
 *  - fee addresses are Gloam addresses (gloamr1.) only
 *  - the link lookup gives fee terms only once the partner's name is approved
 *  - what the relay accepts as a fee (feeProblem) and how it is counted: once per
 *    transaction, only once it landed as a plain private payment, kept per tier
 *  - with an API key, a fee transfer is checked before it is sent, never counted
 *    as one of the partner's payments, and handed back to be counted once it lands
 *
 * The partner store is the in-process one and every chain read is a fake.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-partner-fees.mts
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";

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

const { resetMemoryKv } = await import("../src/lib/partnersKv");
const P = await import("../src/lib/partners");
const L = await import("../src/lib/partnerLinks");
const FM = await import("../src/lib/partnerFeeMath");
const F = await import("../src/lib/partnerFees");
const { relayForPartner } = await import("../src/lib/partnerRelay");
const { VAULT_EVENTS } = await import("../src/lib/partnerVerify");
const { getNetwork } = await import("../src/lib/networks");
const { POST: lookupPost } = await import("../src/app/api/partners/link-code/route");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

resetMemoryKv();
const RH = getNetwork("robinhood-mainnet");
const TEMPO = getNetwork("tempo-mainnet");
const RH_TEST = getNetwork("robinhood");
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const TSLA = "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" as Address;
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const wallet = () => privateKeyToAccount(generatePrivateKey()).address;
const HOST = "gloam.trade";

/** A real Gloam address: gloamr1. and a P-256 public key. */
async function gloamAddress(): Promise<string> {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const spki = Buffer.from(await webcrypto.subtle.exportKey("spki", pair.publicKey));
  return `gloamr1.${spki.toString("base64url")}`;
}
const TAG = await gloamAddress();
const TAG2 = await gloamAddress();

const FEES = { privatePaymentCents: 5, cashoutBps: 25, depositBps: 10 };
const USD6 = { decimals: 6, stable: true };

// ---------------------------------------------------------------- math

await test("math: a flat fee is cents of a dollar stablecoin; other tokens carry none", () => {
  assert.equal(FM.feeDue("private_payment", FEES, USD6, 0n), 50_000n, "$0.05 in a 6-decimal stablecoin");
  assert.equal(FM.feeDue("private_payment", FEES, { decimals: 18, stable: true }, 0n), 5n * 10n ** 16n);
  assert.equal(FM.feeDue("private_payment", FEES, { decimals: 18, stable: false }, 10n ** 18n), 0n, "ETH: no flat fee");
  assert.equal(FM.feeDue("private_payment", { ...FEES, privatePaymentCents: 0 }, USD6, 0n), 0n);
});

await test("math: a share rounds down, swaps carry no fee", () => {
  assert.equal(FM.feeDue("cash_out", FEES, USD6, 1_000_000_000n), 2_500_000n, "0.25% of 1,000");
  assert.equal(FM.feeDue("cash_out", FEES, USD6, 399n), 0n, "under one unit: nothing");
  assert.equal(FM.feeDue("cash_out", FEES, USD6, 401n), 1n);
  assert.equal(FM.feeDue("deposit", FEES, USD6, 1_000_000_000n), 1_000_000n);
  assert.equal(FM.feeDue("private_swap", FEES, USD6, 1_000_000_000n), 0n);
  assert.equal(FM.feeLabel("cash_out", FEES), "0.25% of each cash out");
  assert.equal(FM.feeLabel("private_payment", FEES), "$0.05 per private payment");
});

await test("math: the token's terms come from the chain's token list", () => {
  assert.deepEqual(FM.feeAssetOf(RH.chainId, USDG), { decimals: 6, stable: true });
  assert.equal(FM.feeAssetOf(RH.chainId, TSLA).stable, false);
  assert.deepEqual(FM.feeAssetOf(RH.chainId, "0x0000000000000000000000000000000000000000"), { decimals: 18, stable: false });
});

await test("link fee: only with an approved name, an address on this network, and a fee above 0", () => {
  const terms = { name: "Motion", fees: FEES, feeTo: { robinhood: TAG } };
  const f = FM.linkFee(terms, "cash_out", RH, USD6, 1_000_000_000n)!;
  assert.deepEqual(f, { amount: 2_500_000n, to: TAG, name: "Motion", label: "0.25% of each cash out" });
  assert.equal(FM.linkFee({ ...terms, name: "" }, "cash_out", RH, USD6, 1_000_000_000n), null, "no approved name");
  assert.equal(FM.linkFee(terms, "cash_out", TEMPO, USD6, 1_000_000_000n), null, "no address on Tempo");
  assert.equal(FM.linkFee(null, "cash_out", RH, USD6, 1_000_000_000n), null);
  assert.equal(FM.linkFee(terms, "cash_out", RH, USD6, 100n), null, "rounds to nothing");
  assert.equal(FM.linkFee({ ...terms, feeTo: { robinhood: "gloamr1.broken" } }, "cash_out", RH, USD6, 1_000_000_000n), null, "a broken address adds no fee");
  assert.equal(FM.linkFee(terms, "cash_out", { ...RH, payMemo: null }, USD6, 1_000_000_000n), null, "no memo board: the fee could not reach the partner, so none is added");
  // a network key wins over the chain's
  assert.equal(FM.feeAddressFor({ robinhood: TAG, "robinhood-mainnet": TAG2 }, RH), TAG2);
  assert.equal(FM.feeAddressFor({ robinhood: TAG, "robinhood-mainnet": TAG2 }, RH_TEST), TAG);
});

// ---------------------------------------------------------------- account

await test("account: fee addresses take Gloam addresses only", async () => {
  const owner = wallet();
  await assert.rejects(P.upsertPartner(owner, { name: "Bad Tag", feeTo: { robinhood: wallet() } }), /Gloam address/);
  await assert.rejects(P.upsertPartner(owner, { name: "Bad Tag", feeTo: { mars: TAG } }), /Unknown network/);
  const p = await P.upsertPartner(owner, { name: "Good Tag", feeTo: { robinhood: TAG, tempo: TAG2 } });
  assert.deepEqual(p.feeTo, { robinhood: TAG, tempo: TAG2 });
  const cleared = await P.upsertPartner(owner, { feeTo: { tempo: "" } });
  assert.deepEqual(cleared.feeTo, { robinhood: TAG });
  assert.deepEqual(P.partnerView(cleared).feeTo, { robinhood: TAG });
});

const lookup = (code: string) =>
  lookupPost(
    new Request(`https://${HOST}/api/partners/link-code`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20", origin: `https://${HOST}` },
      body: JSON.stringify({ code }),
    })
  );

await test("lookup: fee terms only once the partner's name is approved", async () => {
  const p = await P.upsertPartner(wallet(), { name: "Fee Shop", fees: FEES, feeTo: { robinhood: TAG } });
  const c = (await L.issueLinkCode({ partnerId: p.id, by: "partner" })).code;
  const before = (await (await lookup(c)).json()) as { data: { name: string | null; fee: unknown } };
  assert.deepEqual(before.data, { name: null, fee: null });
  await P.setApprovedName(p.id, true);
  const after = (await (await lookup(c)).json()) as { data: { name: string; fee: { fees: typeof FEES; feeTo: Record<string, string> } } };
  assert.equal(after.data.name, "Fee Shop");
  assert.deepEqual(after.data.fee.fees, FEES);
  assert.deepEqual(after.data.fee.feeTo, { robinhood: TAG });
});

// ---------------------------------------------------------------- what the relay counts

const shop = await P.upsertPartner(wallet(), { name: "Shop", fees: FEES, feeTo: { robinhood: TAG } });

await test("relay check: the fee must be one the partner set", () => {
  const ok = { kind: "cash_out" as const, asset: USDG, amount: 2_500_000n };
  assert.equal(F.feeProblem(shop, RH, ok), null);
  assert.match(F.feeProblem(shop, TEMPO, ok)!, /no Gloam address/);
  assert.equal(F.feeProblem(shop, RH, { kind: "private_payment", asset: USDG, amount: 50_000n }), null);
  assert.match(F.feeProblem(shop, RH, { kind: "private_payment", asset: USDG, amount: 60_000n })!, /not this partner's fee/);
  assert.match(F.feeProblem(shop, RH, { kind: "private_payment", asset: "0x0000000000000000000000000000000000000000" as Address, amount: 1n })!, /no fee on private payments/, "ETH: no flat fee");
  assert.match(F.feeProblem({ ...shop, fees: { ...FEES, cashoutBps: 0 } }, RH, ok)!, /no fee on cash outs/);
  assert.match(F.feeProblem(shop, RH, { ...ok, asset: "0x00000000000000000000000000000000000000Aa" as Address })!, /does not know that token/);
  assert.match(F.feeProblem(shop, RH, { ...ok, amount: 10n ** 30n })!, /larger than any/);
  assert.match(F.feeProblem(shop, { ...RH, payMemo: null }, ok)!, /no payment memo board/, "no memo board: refused before sending");
});

await test("relay check: partnerFee is read to the letter", () => {
  assert.equal(F.readPartnerFee(undefined), null);
  assert.deepEqual(F.readPartnerFee({ kind: "deposit", asset: USDG.toLowerCase(), amount: "10" }), { kind: "deposit", asset: USDG, amount: 10n });
  for (const bad of [{ kind: "swap", asset: USDG, amount: "1" }, { kind: "cash_out", asset: "0x12", amount: "1" }, { kind: "cash_out", asset: USDG, amount: "0" }, { kind: "cash_out", asset: USDG, amount: 5 }, { kind: "cash_out", asset: USDG, amount: "1", to: "x" }, "fee"]) {
    assert.throws(() => F.readPartnerFee(bad), F.FeeReportError);
  }
});

const transferredLog = (nullifier: Hex) => {
  const ev = VAULT_EVENTS.find((e) => e.name === "Transferred")!;
  return {
    address: RH.pool!,
    topics: encodeEventTopics({ abi: [ev], eventName: "Transferred", args: { nullifier } } as never) as Hex[],
    data: encodeAbiParameters([{ type: "bytes32[2]" }], [[TX(901), TX(902)]]),
  };
};
const unshieldedLog = () => {
  const ev = VAULT_EVENTS.find((e) => e.name === "Unshielded")!;
  return {
    address: RH.pool!,
    topics: encodeEventTopics({ abi: [ev], eventName: "Unshielded", args: { nullifier: TX(903), asset: USDG, to: wallet() } } as never) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [5n]),
  };
};
const fakeReceipts = new Map<string, Awaited<ReturnType<typeof F.feeSettleDeps.receipt>>>();
const settleDeps = { receipt: async (_n: unknown, h: Hex) => fakeReceipts.get(h) ?? null, now: () => 1_800_000_000_000 };
const fee = { kind: "cash_out" as const, asset: USDG, amount: 2_500_000n };

await test("counting: only a landed plain private payment counts, and only once", async () => {
  fakeReceipts.set(TX(1), { status: "reverted", logs: [transferredLog(TX(11))] });
  assert.equal(await F.settleFeeAfterSend({ partner: shop, net: RH, hash: TX(1), fee, source: "link" }, settleDeps), null, "reverted");
  assert.equal(await F.settleFeeAfterSend({ partner: shop, net: RH, hash: TX(2), fee, source: "link" }, settleDeps), null, "never landed");
  fakeReceipts.set(TX(3), { status: "success", logs: [unshieldedLog()] });
  assert.equal(await F.settleFeeAfterSend({ partner: shop, net: RH, hash: TX(3), fee, source: "link" }, settleDeps), null, "a cash out is not a fee");
  fakeReceipts.set(TX(4), { status: "success", logs: [transferredLog(TX(14))] });
  const r = await F.settleFeeAfterSend({ partner: shop, net: RH, hash: TX(4), fee, source: "link" }, settleDeps);
  assert.ok(r && r.reported === true && r.amount === "2500000" && r.symbol === "USDG" && r.usd === 2.5);
  assert.equal(await F.settleFeeAfterSend({ partner: shop, net: RH, hash: TX(4), fee, source: "link" }, settleDeps), null, "counted once");
  const sum = await F.readFeesCharged(shop.id);
  assert.equal(sum.count, 1);
  assert.equal(sum.usd, 2.5);
  assert.deepEqual(sum.byToken.map((t) => [t.symbol, t.kind, t.amount, t.count]), [["USDG", "cash_out", "2.5", 1]]);
  assert.equal(sum.reported, true);
  assert.equal((await F.readFeeLog(shop.id)).length, 1);
});

await test("counting: testnet is kept apart and never valued", async () => {
  const t = await P.upsertPartner(wallet(), { name: "Test Shop", fees: FEES, feeTo: { robinhood: TAG } });
  const r = await F.recordFeeCharged({ partner: t, net: RH_TEST, txHash: TX(5), fee: { kind: "private_payment", asset: (await import("../src/lib/tokens")).shieldTokensFor(RH_TEST.chainId).find((x) => x.symbol === "USDG")!.address as Address, amount: 50_000n }, source: "api" });
  assert.ok(r && r.usd === null);
  assert.equal((await F.readFeesCharged(t.id, "mainnet")).count, 0);
  const test2 = await F.readFeesCharged(t.id, "testnet");
  assert.equal(test2.count, 1);
  assert.equal(test2.usd, 0);
  assert.equal(test2.byToken[0]!.usd, null);
});

// ---------------------------------------------------------------- API key

await test("API key: a fee transfer is checked before sending, claimed, never counted as a payment", async () => {
  let sent = 0;
  const deps = {
    relayTransfer: async () => (sent++, TX(50 + sent)),
    relayUnshield: async () => TX(0),
    relayMemo: async () => TX(0),
    relayVaultSwap: async () => TX(0),
    relayVaultSwapExit: async () => TX(0),
    isSpent: async () => false,
    record: P.recordActivity,
    claim: P.claimTransaction,
    vaultFeeBps: async () => 50,
  };
  const body = (partnerFee: unknown) => ({ action: "transfer", chainId: RH.chainId, partnerFee });
  // not the partner's setting: refused, nothing sent
  await assert.rejects(relayForPartner({ net: RH, body: body({ kind: "private_payment", asset: USDG, amount: "1" }), partner: shop, keyId: "k" }, deps), /Nothing was sent/);
  await assert.rejects(relayForPartner({ net: TEMPO, body: body({ kind: "cash_out", asset: USDG, amount: "1" }), partner: shop, keyId: "k" }, deps), /Nothing was sent/);
  await assert.rejects(relayForPartner({ net: RH, body: body({ kind: "cash_out", asset: USDG, amount: "1", code: "abc" }), partner: shop, keyId: "k" }, deps), /takes no code/);
  await assert.rejects(relayForPartner({ net: RH, body: { action: "unshield", partnerFee: { kind: "cash_out", asset: USDG, amount: "1" } }, partner: shop, keyId: "k" }, deps), /transfer of its own/);
  assert.equal(sent, 0);
  const before = (await P.readPartnerStats(shop.id)).totals.privatePayments;
  const r = await relayForPartner({ net: RH, body: body({ kind: "cash_out", asset: USDG, amount: "2500000" }), partner: shop, keyId: "k" }, deps);
  assert.equal(sent, 1);
  assert.deepEqual(r.partnerFee, { kind: "cash_out", asset: USDG, amount: 2_500_000n });
  assert.equal(r.attribution.recorded, false);
  assert.equal((await P.readPartnerStats(shop.id)).totals.privatePayments, before, "a fee is not one of the partner's payments");
  assert.equal(await P.attributedTo(RH.chainId, r.hash), shop.id, "claimed, so it can't be counted as anything else");
  // a plain payment with the key still counts
  const plain = await relayForPartner({ net: RH, body: { action: "transfer", chainId: RH.chainId }, partner: shop, keyId: "k" }, deps);
  assert.equal(plain.partnerFee, null);
  assert.equal(plain.attribution.recorded, true);
});

console.log(`\n${passed} partner fee tests passed`);
