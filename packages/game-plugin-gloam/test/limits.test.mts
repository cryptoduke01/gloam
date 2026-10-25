import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_SEPOLIA_EURC, BASE_SEPOLIA_USDC, NATIVE_ASSET, RH_MAINNET_USDG } from "@gloamtrade/sdk";
import { CLAIM_LINK_RECIPIENT, DAY_MS, checkSpend, loadLimits, resolveLimits, type CountedSpend, type Spend } from "../src/limits.ts";

const BASE = 84532;
const tag = "gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE";
const usdc = (amount: string): bigint => BigInt(Math.round(Number(amount) * 1e6));

const policy = () =>
  resolveLimits(
    "agent-1",
    {
      recipients: [tag, "0x00000000000000000000000000000000000000AA", CLAIM_LINK_RECIPIENT],
      assets: { USDC: { maxPerPayment: "20", maxPerDay: "50" }, ETH: { maxPerPayment: "0.01", maxPerDay: "0.02" } },
    },
    "test",
    "base"
  );

const spend = (over: Partial<Spend> = {}): Spend => ({
  action: "pay",
  chainId: BASE,
  asset: BASE_SEPOLIA_USDC,
  amountWei: usdc("5"),
  recipient: tag,
  ...over,
});

test("one number for every asset is refused, with the reason", () => {
  for (const raw of [
    { recipients: "any", maxPerPayment: "50", maxPerDay: "200", assets: { USDC: { maxPerPayment: "5", maxPerDay: "10" } } },
    { recipients: "any", maxPerDay: "200", assets: { USDC: { maxPerPayment: "5", maxPerDay: "10" } } },
  ]) {
    assert.throws(() => resolveLimits("a", raw, "t", "base"), /each asset's own units/);
  }
  // The MCP's array form (assets listed, caps on the agent) has no per-asset caps: refused too.
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: ["USDC", "ETH"] }, "t", "base"), /maxPerPayment/);
  // An asset entry missing one of its caps is refused, not filled in from somewhere else.
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: { USDC: { maxPerPayment: "5" } } }, "t", "base"), /maxPerDay is missing/);
});

test("caps are per asset, in each asset's own units", () => {
  const p = policy();
  const u = p.assets.find((a) => a.symbol === "USDC")!;
  const e = p.assets.find((a) => a.symbol === "ETH")!;
  assert.equal(u.address, BASE_SEPOLIA_USDC);
  assert.equal(u.maxPerPayment, 20_000_000n);
  assert.equal(e.address, NATIVE_ASSET);
  assert.equal(e.maxPerPayment, 10n ** 16n);
  // 0.5 ETH is under "20" but over ETH's own cap.
  assert.equal(checkSpend(p, spend({ asset: NATIVE_ASSET, amountWei: 5n * 10n ** 17n }), [], Date.now())?.code, "over_per_payment");
});

test("per payment, rolling day, asset, recipient, action and expiry", () => {
  const p = policy();
  const now = Date.now();
  assert.equal(checkSpend(p, spend(), [], now), null);
  assert.equal(checkSpend(p, spend({ amountWei: usdc("21") }), [], now)?.code, "over_per_payment");
  const counted: CountedSpend[] = [
    { chainId: BASE, asset: BASE_SEPOLIA_USDC, amountWei: usdc("20"), at: now - 1000 },
    { chainId: BASE, asset: BASE_SEPOLIA_USDC, amountWei: usdc("20"), at: now - 2000 },
  ];
  assert.equal(checkSpend(p, spend({ amountWei: usdc("10") }), counted, now), null);
  assert.equal(checkSpend(p, spend({ amountWei: usdc("10.01") }), counted, now)?.code, "over_daily");
  // Older than 24 hours no longer counts.
  const old = counted.map((c) => ({ ...c, at: now - DAY_MS - 1 }));
  assert.equal(checkSpend(p, spend({ amountWei: usdc("20") }), old, now), null);
  // The same token address on another chain is a different asset.
  assert.equal(checkSpend(p, spend({ chainId: 8453 }), [], now)?.code, "asset_not_allowed");
  assert.equal(checkSpend(p, spend({ asset: BASE_SEPOLIA_EURC }), [], now)?.code, "asset_not_allowed");
  assert.equal(checkSpend(p, spend({ recipient: "gloamr1.someoneelse" }), [], now)?.code, "recipient_not_allowed");
  assert.equal(checkSpend(p, spend({ action: "cash_out", recipient: "0x00000000000000000000000000000000000000aa" }), [], now), null);
  assert.equal(checkSpend(p, spend({ recipient: CLAIM_LINK_RECIPIENT }), [], now), null);
  const noCashOut = resolveLimits("a", { recipients: "any", actions: ["pay"], assets: { USDC: { maxPerPayment: 5, maxPerDay: 10 } } }, "t", "base");
  assert.equal(checkSpend(noCashOut, spend({ action: "cash_out" }), [], now)?.code, "action_not_allowed");
  const expired = resolveLimits("a", { recipients: "any", expiresAt: "2020-01-01", assets: { USDC: { maxPerPayment: 5, maxPerDay: 10 } } }, "t", "base");
  assert.equal(checkSpend(expired, spend(), [], now)?.code, "expired");
});

test("bad limits are refused with a plain reason", () => {
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: { USDX: { maxPerPayment: 1, maxPerDay: 1 } } }, "t", "base"), /Unknown asset "USDX"/);
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: { USDC: { maxPerPayment: 9, maxPerDay: 1 } } }, "t", "base"), /above maxPerDay/);
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: { USDC: { maxPerPayment: "1.0000001", maxPerDay: 1 } } }, "t", "base"), /decimal places/);
  assert.throws(() => resolveLimits("a", { recipients: [], assets: { USDC: { maxPerPayment: 1, maxPerDay: 1 } } }, "t", "base"), /recipients/);
  assert.throws(() => resolveLimits("a", { recipients: "any", assets: {} }, "t", "base"), /at least one asset/);
  assert.throws(() => resolveLimits("a", { recipients: "any", tools: ["pay"], assets: { USDC: { maxPerPayment: 1, maxPerDay: 1 } } }, "t", "base"), /unknown field "tools"/);
});

test("an asset can name another network; USDG on Robinhood Chain mainnet is a different asset from Base USDC", () => {
  const p = resolveLimits("a", { recipients: "any", assets: { USDG: { maxPerPayment: 5, maxPerDay: 10, network: "robinhood-mainnet" } } }, "t", "base");
  assert.equal(p.assets[0]!.address, RH_MAINNET_USDG);
  assert.equal(p.assets[0]!.chainId, 4663);
  assert.equal(checkSpend(p, spend(), [], Date.now())?.code, "asset_not_allowed");
});

test("loadLimits: nothing set means nothing moves; the MCP file format works per agent", () => {
  const unset = loadLimits({ agent: "a", network: "base", readFile: () => "" });
  assert.equal(unset.mode, "unset");
  const file = JSON.stringify({
    agents: {
      payer: { recipients: "any", assets: { USDC: { maxPerPayment: "5", maxPerDay: "10" } } },
      "old-style": { recipients: "any", maxPerPayment: "5", maxPerDay: "10", assets: ["USDC", "ETH"] },
    },
  });
  const ok = loadLimits({ agent: "payer", network: "base", file: "limits.json", readFile: () => file });
  assert.equal(ok.mode, "enforced");
  const old = loadLimits({ agent: "old-style", network: "base", file: "limits.json", readFile: () => file });
  assert.equal(old.mode, "invalid");
  assert.match((old as { error: string }).error, /each asset's own units/);
  const missing = loadLimits({ agent: "nobody", network: "base", file: "limits.json", readFile: () => file });
  assert.equal(missing.mode, "invalid");
  const both = loadLimits({ agent: "payer", network: "base", file: "x", limits: { recipients: "any", assets: { USDC: { maxPerPayment: 1, maxPerDay: 1 } } }, readFile: () => file });
  assert.equal(both.mode, "invalid");
  const broken = loadLimits({ agent: "payer", network: "base", file: "x", readFile: () => "{" });
  assert.equal(broken.mode, "invalid");
});

test("adding to its own private balance is allowed or not, never capped", () => {
  const p = policy();
  const now = Date.now();
  assert.equal(checkSpend(p, spend({ action: "add", amountWei: usdc("400"), recipient: null }), [], now), null);
  assert.equal(checkSpend(p, spend({ action: "add", asset: BASE_SEPOLIA_EURC, recipient: null }), [], now)?.code, "asset_not_allowed");
  const payOnly = resolveLimits("a", { recipients: "any", actions: ["pay"], assets: { USDC: { maxPerPayment: 5, maxPerDay: 10 } } }, "t", "base");
  assert.equal(checkSpend(payOnly, spend({ action: "add", recipient: null }), [], now)?.code, "action_not_allowed");
});
