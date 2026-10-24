/**
 * Self-test: the keys that move between the Vault tabs (lib/tabKeys), and
 * claim fragments that can't be decoded are ignored, never thrown.
 *
 * Review, 24 Oct 2026: the Vault's Add / Pay / Swap / Public send row is a
 * tablist, but only Tab moved through it, one stop per tab; the arrows did
 * nothing. Each tab is now one stop, and Left, Right, Home and End move along
 * the row. The app's own claim-link reader used decodeURIComponent on the raw
 * fragment, so a link cut mid-escape threw while the Vault page loaded.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-tab-keys.mts
 */
import assert from "node:assert/strict";
import { tabKeyTarget } from "../src/lib/tabKeys";
import { codeFromHash } from "../src/lib/claimLink";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

test("Right and Left step along the row and wrap at the ends", () => {
  assert.equal(tabKeyTarget("ArrowRight", 0, 4), 1);
  assert.equal(tabKeyTarget("ArrowRight", 3, 4), 0);
  assert.equal(tabKeyTarget("ArrowLeft", 2, 4), 1);
  assert.equal(tabKeyTarget("ArrowLeft", 0, 4), 3);
});

test("Home and End go to the first and last tab", () => {
  assert.equal(tabKeyTarget("Home", 2, 5), 0);
  assert.equal(tabKeyTarget("End", 1, 5), 4);
});

test("other keys are left to the tab itself (Enter and Space pick it)", () => {
  for (const key of ["Enter", " ", "Tab", "ArrowDown", "ArrowUp", "a"]) assert.equal(tabKeyTarget(key, 1, 4), null, key);
  assert.equal(tabKeyTarget("ArrowRight", 0, 0), null, "an empty row");
  assert.equal(tabKeyTarget("ArrowRight", 0, 1), 0, "one tab stays put");
});

test("a claim fragment cut mid-escape reads as no claim, without throwing", () => {
  assert.throws(() => decodeURIComponent("%E0%A4%A"), URIError, "what the Vault page used to call");
  assert.equal(codeFromHash("#claim=gloam1=%E0%A4%A"), null);
  assert.equal(codeFromHash("#claim=%"), null);
  assert.equal(codeFromHash("#other=1"), null);
  assert.equal(codeFromHash("#claim=gloam1=abc=1def"), "gloam1.abc-def", "a link-safe code reads back");
});

console.log(`\n${passed} tab key checks passed`);
