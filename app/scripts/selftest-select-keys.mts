/**
 * Self-test: the keys inside the app's dropdown (lib/listboxKeys, used by
 * components/ui/Select).
 *
 * 25 Oct 2026: the asset pickers on Add and Request a payment, and the payroll
 * schedule's day and currency fields, were native selects, so their menus were
 * the operating system's (grey on macOS). They are now one Gloam dropdown. Up
 * and Down step over disabled options and stop at the ends, Home and End jump,
 * Enter or Space picks, Escape closes, Tab closes and moves on, and typing
 * jumps to the option that starts with what was typed.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-select-keys.mts
 */
import assert from "node:assert/strict";
import {
  firstEnabled,
  isTypeaheadKey,
  lastEnabled,
  listboxKey,
  openingIndex,
  stepEnabled,
  typeahead,
  type ListboxItem,
} from "../src/lib/listboxKeys";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const tokens: ListboxItem[] = [{ label: "ETH" }, { label: "USDC" }, { label: "EURC" }];
const withOff: ListboxItem[] = [
  { label: "Off", disabled: true },
  { label: "ETH" },
  { label: "Soon", disabled: true },
  { label: "USDC" },
  { label: "Later", disabled: true },
];
const ordinals: ListboxItem[] = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  const s = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return { label: `${d}${s}` };
});

test("Down and Up step one option and stop at the ends, as a native select does", () => {
  assert.deepEqual(listboxKey("ArrowDown", 0, tokens), { kind: "move", index: 1 });
  assert.deepEqual(listboxKey("ArrowDown", 2, tokens), { kind: "move", index: 2 });
  assert.deepEqual(listboxKey("ArrowUp", 1, tokens), { kind: "move", index: 0 });
  assert.deepEqual(listboxKey("ArrowUp", 0, tokens), { kind: "move", index: 0 });
});

test("disabled options are stepped over and never picked", () => {
  assert.deepEqual(listboxKey("ArrowDown", 1, withOff), { kind: "move", index: 3 });
  assert.deepEqual(listboxKey("ArrowUp", 3, withOff), { kind: "move", index: 1 });
  assert.deepEqual(listboxKey("ArrowUp", 1, withOff), { kind: "move", index: 1 }, "nothing above but a disabled one");
  assert.deepEqual(listboxKey("ArrowDown", 3, withOff), { kind: "move", index: 3 }, "nothing below but a disabled one");
  assert.equal(listboxKey("Enter", 2, withOff), null, "Enter on a disabled option does nothing");
  assert.equal(stepEnabled(withOff, 1, 1, 10), 3);
});

test("Home and End go to the first and last option that can be picked", () => {
  assert.deepEqual(listboxKey("Home", 2, tokens), { kind: "move", index: 0 });
  assert.deepEqual(listboxKey("End", 0, tokens), { kind: "move", index: 2 });
  assert.deepEqual(listboxKey("Home", 3, withOff), { kind: "move", index: 1 });
  assert.deepEqual(listboxKey("End", 1, withOff), { kind: "move", index: 3 });
  assert.equal(firstEnabled(withOff), 1);
  assert.equal(lastEnabled(withOff), 3);
});

test("Page Down and Page Up move ten at a time and stop at the ends", () => {
  assert.deepEqual(listboxKey("PageDown", 0, ordinals), { kind: "move", index: 10 });
  assert.deepEqual(listboxKey("PageDown", 25, ordinals), { kind: "move", index: 30 });
  assert.deepEqual(listboxKey("PageUp", 14, ordinals), { kind: "move", index: 4 });
  assert.deepEqual(listboxKey("PageUp", 3, ordinals), { kind: "move", index: 0 });
});

test("Enter and Space pick the highlighted option; Escape closes; Tab leaves", () => {
  assert.deepEqual(listboxKey("Enter", 1, tokens), { kind: "pick", index: 1 });
  assert.deepEqual(listboxKey(" ", 2, tokens), { kind: "pick", index: 2 });
  assert.deepEqual(listboxKey("Escape", 1, tokens), { kind: "close" });
  assert.deepEqual(listboxKey("Tab", 1, tokens), { kind: "leave" });
  assert.equal(listboxKey("a", 1, tokens), null, "letters go to type-ahead");
  assert.equal(listboxKey("ArrowLeft", 1, tokens), null);
});

test("with no highlight, Down starts at the top and Up at the bottom", () => {
  assert.deepEqual(listboxKey("ArrowDown", -1, withOff), { kind: "move", index: 1 });
  assert.deepEqual(listboxKey("ArrowUp", -1, withOff), { kind: "move", index: 3 });
  assert.equal(listboxKey("Enter", -1, tokens), null);
});

test("a list with nothing to pick still closes, and moves nowhere", () => {
  const none: ListboxItem[] = [{ label: "A", disabled: true }];
  assert.equal(listboxKey("ArrowDown", 0, none), null);
  assert.equal(listboxKey("Enter", 0, none), null);
  assert.deepEqual(listboxKey("Escape", 0, none), { kind: "close" });
  assert.deepEqual(listboxKey("Tab", -1, []), { kind: "leave" });
});

test("it opens on the chosen option, or the first one that can be picked", () => {
  assert.equal(openingIndex(tokens, 2), 2);
  assert.equal(openingIndex(tokens, -1), 0, "a value no option matches");
  assert.equal(openingIndex(withOff, 2), 1, "the chosen option was turned off");
});

test("type-ahead: one letter jumps to the next option starting with it", () => {
  assert.deepEqual(typeahead("", "u", 0, tokens), { typed: "u", index: 1 });
  assert.deepEqual(typeahead("", "E", 1, tokens), { typed: "e", index: 2 }, "case does not matter, and it looks after the highlight");
  assert.deepEqual(typeahead("", "e", 2, tokens), { typed: "e", index: 0 }, "and wraps round");
  assert.deepEqual(typeahead("", "z", 0, tokens), { typed: "z", index: null });
});

test("type-ahead: the same letter again cycles; a word narrows down", () => {
  const r1 = typeahead("", "e", 0, tokens);
  assert.equal(r1.index, 2, "EURC, after ETH");
  const r2 = typeahead(r1.typed, "e", r1.index!, tokens);
  assert.deepEqual(r2, { typed: "ee", index: 0 }, "back to ETH");
  const w1 = typeahead("", "e", 1, tokens);
  assert.equal(w1.index, 2);
  const w2 = typeahead(w1.typed, "t", w1.index!, tokens);
  assert.deepEqual(w2, { typed: "et", index: 0 }, "ET is ETH");
});

test("type-ahead on the payroll day: 1 then 5 lands on the 15th, 3 then 1 on the 31st", () => {
  const a = typeahead("", "1", 0, ordinals);
  assert.equal(ordinals[a.index!].label, "10th", "1 alone moves on from the 1st, as a native select does");
  const b = typeahead(a.typed, "5", a.index!, ordinals);
  assert.equal(ordinals[b.index!].label, "15th");
  const c = typeahead("", "3", 0, ordinals);
  assert.equal(ordinals[c.index!].label, "3rd");
  const d = typeahead(c.typed, "1", c.index!, ordinals);
  assert.equal(ordinals[d.index!].label, "31st");
});

test("type-ahead skips disabled options", () => {
  assert.equal(typeahead("", "s", 1, withOff).index, null, "Soon is off");
  assert.equal(typeahead("", "u", 0, withOff).index, 3);
});

test("which keys type: printable characters without Ctrl, Alt or Cmd; Space only mid-word", () => {
  assert.equal(isTypeaheadKey({ key: "a" }), true);
  assert.equal(isTypeaheadKey({ key: "5" }), true);
  assert.equal(isTypeaheadKey({ key: "a", metaKey: true }), false, "Cmd+A");
  assert.equal(isTypeaheadKey({ key: "c", ctrlKey: true }), false);
  assert.equal(isTypeaheadKey({ key: "ArrowDown" }), false);
  assert.equal(isTypeaheadKey({ key: " " }), false, "Space picks");
  assert.equal(isTypeaheadKey({ key: " " }, true), true, "while typing, Space is part of the word");
});

console.log(`\n${passed} dropdown key checks passed`);
