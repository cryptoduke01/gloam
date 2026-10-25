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
  addAssetHref,
  pickAddAsset,
  vaultActionBlocked,
  vaultActionFromUrl,
  vaultActionSearch,
  vaultActionsFor,
  type VaultActionId,
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
  // Robinhood Chain mainnet: swaps live, a native coin, no stocks
  assert.deepEqual(ids({ swap: true, stocks: false, native: true }), ["shield", "pay", "receive", "swap", "cashout", "send"]);
  // Tempo: no native coin to send, no swap router on the testnet
  assert.deepEqual(ids({ swap: false, stocks: false, native: false }), ["shield", "pay", "receive", "cashout"]);
  // Robinhood Chain testnet: stocks
  assert.deepEqual(ids({ swap: false, stocks: true, native: true }), ["shield", "pay", "receive", "cashout", "trade", "send"]);
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

test("a tab this network does not have opens the overview, not a blank page", () => {
  const tempo = vaultActionsFor({ swap: false, stocks: false, native: false });
  assert.equal(vaultActionFromUrl("swap", null, "", tempo), null);
  assert.equal(vaultActionFromUrl("send", null, "", tempo), null);
  assert.equal(vaultActionFromUrl("move", "cashout", "", tempo), "cashout");
});

test("each action writes the deep link the app already serves", () => {
  const want: Record<VaultActionId, string> = {
    shield: "?tab=shield",
    pay: "?tab=move",
    receive: "?tab=move&mode=receive",
    swap: "?tab=swap",
    cashout: "?tab=move&mode=cashout",
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

console.log(`\n${passed} passed`);
