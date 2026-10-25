/**
 * Self-test: what Settings says after restoring a backup (lib/restoreMessage).
 *
 * QA, 25 Oct 2026: a backup restored into a browser that held none of it, with
 * its balances not in the vault yet or not Gloam balances at all, read
 * "Everything in this backup is already in this browser, so nothing changed",
 * then said the opposite in the next sentence. "Already here" is now said only
 * when it is true of everything, and the rest of the message says what was
 * held back.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-restore-message.mts
 */
import assert from "node:assert/strict";
import { restoreMessage, type RestoreCounts } from "../src/lib/restoreMessage";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const zero: RestoreCounts = { count: 0, kept: 0, moved: 0, movedClaims: 0, unseen: 0, skipped: 0 };
const msg = (r: Partial<RestoreCounts>) => restoreMessage({ ...zero, ...r });
const ALREADY = "Everything in this backup is already in this browser";

test("balances added are counted", () => {
  assert.equal(msg({ count: 2 }), "Restored 2 balance(s). Open Portfolio or Vault to see them.");
  assert.ok(msg({ count: 1, unseen: 1 }).startsWith("Restored 1 balance(s)."));
});

test("an empty backup still says what happened", () => {
  assert.equal(msg({}), "Restored 0 balance(s). Open Portfolio or Vault to see them.");
});

test("everything already here says so, and only then", () => {
  assert.equal(msg({ kept: 7 }), `${ALREADY}, so nothing changed.`);
  for (const r of [{ unseen: 3 }, { skipped: 7 }, { unseen: 1, skipped: 1 }, { kept: 2, skipped: 1 }, { kept: 2, unseen: 1 }]) {
    assert.ok(!msg(r).includes(ALREADY), `not "already here" for ${JSON.stringify(r)}: ${msg(r)}`);
  }
});

test("held-back balances lead with nothing added, then say why", () => {
  assert.equal(
    msg({ skipped: 7 }),
    "Nothing was added to your balance. 7 entries in this backup are not Gloam balances, so they were left out."
  );
  assert.equal(
    msg({ unseen: 1 }),
    "Nothing was added to your balance. One balance in this backup is not in the vault, so it stays out of your balance until it is."
  );
  assert.equal(
    msg({ kept: 2, skipped: 1 }),
    "Nothing was added to your balance. One entry in this backup is not a Gloam balance, so it was left out. The rest is already in this browser."
  );
});

test("spent balances read as before", () => {
  assert.equal(
    msg({ moved: 1 }),
    "One balance in this backup was spent after the backup was made, so it stays out of your balance."
  );
  assert.equal(
    msg({ moved: 2, movedClaims: 1, kept: 3 }),
    "2 balances in this backup were spent after the backup was made, so they stay out of your balance. A claimed payment you secured since then is in the browser where you secured it, and in any backup made after that. The rest is already in this browser."
  );
});

console.log(`\n${passed} passed`);
