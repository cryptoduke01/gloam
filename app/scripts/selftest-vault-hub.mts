/**
 * Self-test: the Vault's landing and action row (lib/vaultHub).
 *
 * Review, 25 Oct 2026: a first-time user could not find how to pay privately
 * or cash out. Cash out sat inside Pay, and the Vault opened straight on Add.
 * The Vault now opens on an overview that names every action with one line,
 * and a row on every action page switches between them. This holds which
 * action each link opens (old links included), the link each action writes,
 * what each network offers, when an action waits for a private balance, and
 * which wallet balance the overview suggests adding.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-vault-hub.mts
 */
import assert from "node:assert/strict";
import {
  ADD_FIRST,
  VAULT_ACTIONS,
  topUpsSetAside,
  addAssetHref,
  pickAddAsset,
  vaultActionBlocked,
  vaultActionFromUrl,
  vaultActionSearch,
  vaultActionsFor,
  vaultHashAfterQuery,
  type VaultActionId,
  compareHoldings,
} from "../src/lib/vaultHub";
import { appClaimPath } from "../src/lib/claimLink";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const ALL = VAULT_ACTIONS;
const ids = (o: Parameters<typeof vaultActionsFor>[0]) => vaultActionsFor(o).map((a) => a.id);

test("the five main actions come first, in the order money moves", () => {
  assert.deepEqual(
    VAULT_ACTIONS.filter((a) => !a.extra).map((a) => a.label),
    ["Add privately", "Pay privately", "Receive", "Swap", "Cash out"]
  );
  for (const a of VAULT_ACTIONS) assert.ok(a.line.length > 0 && a.line.length <= 100, `${a.id} has one short line`);
});

test("each network gets the actions it has", () => {
  // Robinhood Chain mainnet: swaps live, no stocks
  assert.deepEqual(ids({ swap: true, stocks: false }), ["shield", "pay", "receive", "swap", "cashout", "topups", "send"]);
  // Tempo testnet: no swap router; Public send carries its stablecoins
  assert.deepEqual(ids({ swap: false, stocks: false }), ["shield", "pay", "receive", "cashout", "topups", "send"]);
  // Robinhood Chain testnet: stocks
  assert.deepEqual(ids({ swap: false, stocks: true }), ["shield", "pay", "receive", "cashout", "topups", "trade", "send"]);
});

test("a URL opens its action, and the bare Vault opens the overview", () => {
  const at = (tab: string | null, mode: string | null = null, hash = "") => vaultActionFromUrl(tab, mode, hash, ALL);
  assert.equal(at(null), null);
  assert.equal(at("shield"), "shield");
  assert.equal(at("move"), "pay");
  assert.equal(at("move", "pay"), "pay", "a payment request link opens Pay");
  assert.equal(at("move", "receive"), "receive");
  assert.equal(at("move", "cashout"), "cashout");
  assert.equal(at("swap"), "swap");
  assert.equal(at("send"), "send");
  assert.equal(at("trade"), "trade");
  assert.equal(at("nonsense"), null);
  assert.equal(at(null, "cashout"), null, "no tab is the overview, whatever the mode");
});

test("the Vault and the app nav give each action the same name and link", () => {
  for (const a of VAULT_ACTIONS) assert.equal(`/app/vault${vaultActionSearch(a.id, "")}`, a.href, a.id);
});

test("claim links open Receive, old ones without a mode too", () => {
  const url = new URL(`https://gloam.trade${appClaimPath("gloam1.abc", "tempo")}`);
  assert.equal(vaultActionFromUrl(url.searchParams.get("tab"), url.searchParams.get("mode"), url.hash, ALL), "receive");
  assert.equal(vaultActionFromUrl("move", null, "#claim=gloam1.abc", ALL), "receive");
  assert.equal(vaultActionFromUrl(null, null, "#claim=gloam1.abc", ALL), "receive");
  assert.equal(vaultActionFromUrl("move", null, "#to=gloamr1.x&amount=5", ALL), "pay", "a request fragment stays on Pay");
});

test("a claim already taken stops marking Receive once the URL names another action", () => {
  // QA, 25 Oct 2026: after a claim link, the nav's Pay privately (and Cash
  // out, and the steps after a claim) showed Pay's form under a row that
  // still marked Receive, because Pay clears the fragment without a hashchange.
  const claim = "#claim=gloam1.abc";
  const after = (tab: string | null, mode: string | null, live = "") => {
    const hash = vaultHashAfterQuery(claim, live, tab, mode);
    return vaultActionFromUrl(tab, mode, hash, ALL);
  };
  assert.equal(after("move", null), "pay", "the nav's Pay privately");
  assert.equal(after("move", "cashout"), "cashout", "the nav's Cash out");
  assert.equal(after("move", "receive"), "receive", "Pay writing back the claim's mode");
  assert.equal(after("shield", null), "shield");
  assert.equal(after("move", null, claim), "receive", "a claim not read yet still opens Receive");
  assert.equal(after(null, "receive"), "receive", "an old claim link without a tab keeps its claim once Pay writes a mode");
  assert.equal(after(null, null), "receive", "nor does a bare Vault URL drop a claim Pay has not read");
  assert.equal(vaultHashAfterQuery("", "#to=gloamr1.x", "move", "pay"), "#to=gloamr1.x", "a request fragment is read as it is");
});

test("a tab this network does not have opens the overview, not a blank page", () => {
  const base = vaultActionsFor({ swap: false, stocks: false });
  assert.equal(vaultActionFromUrl("swap", null, "", base), null);
  assert.equal(vaultActionFromUrl("trade", null, "", base), null);
  assert.equal(vaultActionFromUrl("send", null, "", base), "send");
  assert.equal(vaultActionFromUrl("move", "cashout", "", base), "cashout");
});

test("the overview says what agent top-ups hold out of the balance", () => {
  const USDC = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
  const tag = { plan: "p", piece: 1, of: 2, to: "0x1", window: "day", topUp: { day: 1, everyDays: 7 } };
  const n = (cashOut: string | null, over: object = {}) =>
    ({ asset: USDC, amountWei: "5000000", status: "open", cashOutPlan: tag, ...(cashOut ? { cashOut: { job: "j", at: 1, to: "0x1", state: cashOut } } : {}), ...over }) as never;
  const got = topUpsSetAside([
    n("scheduled"),
    n("sent"),
    n("scheduled", { status: "recovered" }), // it went out
    n("failed"), // back in the balance
    n(null), // not scheduled: still in the balance
    n("scheduled", { cashOutPlan: { ...tag, topUp: undefined } }), // an ordinary piece
    n("failed", { proofOutAt: 1 }), // on its way back to a fresh note: out of the balance until it lands
  ]);
  assert.deepEqual([...got], [[USDC, 15_000_000n]]);
  assert.equal(topUpsSetAside([]).size, 0);
});

test("each action writes the deep link the app already serves", () => {
  const want: Record<VaultActionId, string> = {
    shield: "?tab=shield",
    pay: "?tab=move",
    receive: "?tab=move&mode=receive",
    swap: "?tab=swap",
    cashout: "?tab=move&mode=cashout",
    topups: "?tab=topups",
    trade: "?tab=trade",
    send: "?tab=send",
  };
  for (const { id } of ALL) {
    assert.equal(vaultActionSearch(id, ""), want[id], id);
    // and it reads back as the same action
    const p = new URLSearchParams(want[id]);
    assert.equal(vaultActionFromUrl(p.get("tab"), p.get("mode"), "", ALL), id);
  }
});

test("switching keeps the rest of the query, and drops one action's mode and asset", () => {
  assert.equal(vaultActionSearch("shield", "?tab=move&mode=cashout&net=tempo"), "?tab=shield&net=tempo");
  assert.equal(vaultActionSearch("cashout", "?tab=shield&asset=usdg"), "?tab=move&mode=cashout");
  assert.equal(vaultActionSearch("pay", "tab=move&mode=receive"), "?tab=move");
  assert.equal(addAssetHref("usdg"), "/app/vault?tab=shield&asset=usdg");
});

test("spending actions wait for a private balance, and only once it is known", () => {
  const pay = VAULT_ACTIONS.find((a) => a.id === "pay")!;
  const add = VAULT_ACTIONS.find((a) => a.id === "shield")!;
  const receive = VAULT_ACTIONS.find((a) => a.id === "receive")!;
  assert.equal(vaultActionBlocked(pay, { known: true, hasPrivate: false }), ADD_FIRST);
  assert.equal(vaultActionBlocked(pay, { known: false, hasPrivate: false }), null, "while it loads, or with no wallet");
  assert.equal(vaultActionBlocked(pay, { known: true, hasPrivate: true }), null);
  assert.equal(vaultActionBlocked(add, { known: true, hasPrivate: false }), null);
  assert.equal(vaultActionBlocked(receive, { known: true, hasPrivate: false }), null, "Receive never waits");
  for (const id of ["pay", "swap", "cashout"] as const) {
    assert.ok(VAULT_ACTIONS.find((a) => a.id === id)!.spends, `${id} spends`);
  }
});

test("the overview suggests a dollar stablecoin first, then the largest balance", () => {
  const rows = [
    { id: "gloam", amount: 9000, dollar: false },
    { id: "usdg", amount: 120, dollar: true },
    { id: "usdc", amount: 80, dollar: true },
  ];
  assert.equal(pickAddAsset(rows)?.id, "usdg");
  assert.equal(pickAddAsset([{ id: "eth", amount: 0.4, dollar: false }, { id: "gloam", amount: 12, dollar: false }])?.id, "gloam");
  assert.equal(pickAddAsset([{ id: "usdg", amount: 0, dollar: true }]), null, "nothing to suggest at zero");
  assert.equal(pickAddAsset([]), null);
});

test("balances list in one order everywhere: dollar stablecoins, then the larger holding, then by name", () => {
  const rows = [
    { symbol: "TSLA", amount: 6, dollar: false },
    { symbol: "USDG", amount: 48250, dollar: true },
    { symbol: "AMZN", amount: 10, dollar: false },
    { symbol: "ETH", amount: 2.4, dollar: false },
    { symbol: "USDC", amount: 48250, dollar: true },
  ];
  assert.deepEqual(
    [...rows].sort(compareHoldings).map((r) => r.symbol),
    ["USDC", "USDG", "AMZN", "TSLA", "ETH"]
  );
});

console.log(`\n${passed} passed`);
