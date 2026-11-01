/**
 * Self-test: the Vault's actions in the app nav (lib/vaultNav).
 *
 * Review, 25 Oct 2026: a tester could not find where to pay privately or cash
 * out, because both sat inside Vault's Pay tab. The app nav now lists the
 * Vault's actions under it, each a link the app already serves. Pay's mode
 * (Send, Receive, Cash out) was read from ?mode= only when the page opened, so
 * a nav link that only changed ?mode= left the old mode on screen; MoveView now
 * follows the URL both ways, through the helpers checked here.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-vault-nav.mts
 */
import assert from "node:assert/strict";
import {
  VAULT_ACTIONS,
  moveModeFromParam,
  searchWithMoveMode,
  vaultActionFromParams,
  vaultActionsFor,
} from "../src/lib/vaultNav";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const ids = (list: { id: string }[]) => list.map((a) => a.id);

test("the nav links are the deep links the app already serves", () => {
  const href = Object.fromEntries(VAULT_ACTIONS.map((a) => [a.id, a.href]));
  assert.equal(href.shield, "/app/vault?tab=shield");
  assert.equal(href.pay, "/app/vault?tab=move");
  assert.equal(href.receive, "/app/vault?tab=move&mode=receive");
  assert.equal(href.cashout, "/app/vault?tab=move&mode=cashout");
  assert.equal(href.swap, "/app/vault?tab=swap");
  assert.equal(href.topups, "/app/vault?tab=topups");
  assert.equal(href.trade, "/app/vault?tab=trade");
  assert.equal(href.send, "/app/vault?tab=send");
});

test("every network lists Add, Pay, Receive, Cash out, Agent top-ups and Public send, in the order money moves", () => {
  assert.deepEqual(ids(vaultActionsFor({ swap: false, stocks: false })), ["shield", "pay", "receive", "cashout", "topups", "send"]);
});

test("Swap and Trade appear only where the network has them", () => {
  assert.deepEqual(ids(vaultActionsFor({ swap: true, stocks: false })), ["shield", "pay", "receive", "swap", "cashout", "topups", "send"]);
  assert.deepEqual(ids(vaultActionsFor({ swap: true, stocks: true })), [
    "shield",
    "pay",
    "receive",
    "swap",
    "cashout",
    "topups",
    "trade",
    "send",
  ]);
});

test("Pay's mode from ?mode=: receive and cash out, anything else is Send", () => {
  assert.equal(moveModeFromParam("receive"), "receive");
  assert.equal(moveModeFromParam("cashout"), "cashout");
  assert.equal(moveModeFromParam("pay"), "send", "a payment request link");
  assert.equal(moveModeFromParam(null), "send");
  assert.equal(moveModeFromParam("bogus"), "send");
});

test("the marked nav entry matches what the Vault shows", () => {
  assert.equal(vaultActionFromParams(null, null), null, "no tab opens the overview: Vault itself is marked");
  assert.equal(vaultActionFromParams("shield", null), "shield");
  assert.equal(vaultActionFromParams("move", null), "pay");
  assert.equal(vaultActionFromParams("move", "pay"), "pay");
  assert.equal(vaultActionFromParams("move", "receive"), "receive");
  assert.equal(vaultActionFromParams("move", "cashout"), "cashout");
  assert.equal(vaultActionFromParams("swap", null), "swap");
  assert.equal(vaultActionFromParams("topups", null), "topups");
  assert.equal(vaultActionFromParams("nope", null), null, "an unknown tab opens the overview");
});

test("a tab this network does not have opens the overview, which is what the Vault falls back to", () => {
  const base = vaultActionsFor({ swap: false, stocks: false });
  assert.equal(vaultActionFromParams("swap", null, base), null);
  assert.equal(vaultActionFromParams("trade", null, base), null);
  assert.equal(vaultActionFromParams("send", null, base), "send");
  assert.equal(vaultActionFromParams("move", "cashout", base), "cashout");
});

test("writing Pay's mode into the URL keeps the rest of the query", () => {
  assert.equal(searchWithMoveMode("?tab=move", "cashout"), "?tab=move&mode=cashout");
  assert.equal(searchWithMoveMode("?tab=move&mode=cashout", "receive"), "?tab=move&mode=receive");
  assert.equal(searchWithMoveMode("?tab=move&mode=receive&net=tempo", "send"), "?tab=move&net=tempo");
  assert.equal(searchWithMoveMode("?tab=move&net=tempo&mode=receive", "cashout"), "?tab=move&net=tempo&mode=cashout");
});

test("no write when the URL already says that mode, so the two never chase each other", () => {
  assert.equal(searchWithMoveMode("?tab=move", "send"), null);
  assert.equal(searchWithMoveMode("?tab=move&mode=pay", "send"), null, "a request link keeps mode=pay");
  assert.equal(searchWithMoveMode("?tab=move&mode=receive", "receive"), null);
  assert.equal(searchWithMoveMode("?tab=move&mode=cashout", "cashout"), null);
});

test("an empty query stays empty when Send is written", () => {
  assert.equal(searchWithMoveMode("?mode=receive", "send"), "");
});

console.log(`\n${passed} passed`);
