/**
 * Self-test: a payroll list is read the way it was written.
 *
 * Review, 24 Oct 2026: every line used to split on commas, tabs and semicolons
 * at once, so a semicolon or tab list's "1,25" or "1,250" became two cells and
 * the row quietly paid 1. One delimiter per list now, a shifted row is
 * refused, and a quote that never closes is a row error.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-payroll-csv.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { parseUnits, type Address } from "viem";

const { parsePayrollCsv, PAYROLL_TEMPLATE } = await import("../src/lib/payroll");
const { assetDecimals } = await import("../src/lib/shield");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const ASSET = "0x00000000000000000000000000000000000000ee" as Address;
const units = (s: string) => parseUnits(s, assetDecimals(ASSET));
const one = (csv: string) => {
  const { rows, error } = parsePayrollCsv(csv, ASSET);
  assert.equal(error, null, csv);
  assert.equal(rows.length, 1, csv);
  return rows[0];
};

// ------------------------------------------------------------------ CSV

test("a semicolon list's decimal comma is refused, never paid as 1", () => {
  const r = one("name;gloam_address;amount\nAda;;1,25");
  assert.equal(r.amount, null);
  assert.match(r.error ?? "", /dot for decimals/);
});

test("a tab list keeps 1,250 whole (1250, not 1)", () => {
  assert.equal(one("name\tamount\nAda\t1,250").amount, units("1250"));
  assert.equal(one("name\tgloam_address\tamount\nAda\t\t12,500.75").amount, units("12500.75"));
});

test("a tab list's empty first cells stay in their columns", () => {
  const r = one("name\tgloam_address\tamount\n\t\t1.25");
  assert.equal(r.error, null);
  assert.equal(r.amount, units("1.25"));
  assert.equal(r.name, "Person 1");
});

test("a comma list keeps a semicolon inside its note", () => {
  const r = one("name,gloam_address,amount,note\nAda,,10,salary; bonus");
  assert.equal(r.note, "salary; bonus");
  assert.equal(r.amount, units("10"));
});

test("a semicolon list keeps a comma inside its note", () => {
  const r = one("name;amount;note\nAda;1.25;salary, bonus");
  assert.equal(r.note, "salary, bonus");
  assert.equal(r.amount, units("1.25"));
});

test("a quoted 1,250 in a comma list is one cell", () => {
  assert.equal(one('name,amount,note\nAda,"1,250","Sept, final"').amount, units("1250"));
  assert.equal(one('name,amount\n"Obi, Ada",980').name, "Obi, Ada");
});

test("an unquoted decimal comma in a comma list is refused, not paid as 1", () => {
  const r = one("name,amount\nAda,1,25");
  assert.equal(r.amount, null);
  assert.match(r.error ?? "", /more cells than the list has columns/);
  // without a header, a row wider than the first one is refused the same way
  const { rows } = parsePayrollCsv("Ada,,10\nTunde,,1,25", ASSET);
  assert.equal(rows[0].error, null);
  assert.equal(rows[1].amount, null);
  assert.match(rows[1].error ?? "", /more cells/);
});

test("a quote that never closes, or text after one, is a row error", () => {
  for (const csv of ['name,amount\nAda,"1.25', 'name,amount\nAda,"1"25', 'name,amount\n"Ada"x,10']) {
    const r = one(csv);
    assert.equal(r.amount, null, csv);
    assert.match(r.error ?? "", /quotes/, csv);
  }
  // a quote inside a plain cell is just a character
  assert.equal(one('name,amount\nAda "Ace" Obi,10').name, 'Ada "Ace" Obi');
});

test("the template and plain lists read as before", () => {
  const { rows, error } = parsePayrollCsv(PAYROLL_TEMPLATE, ASSET);
  assert.equal(error, null);
  assert.equal(rows.length, 2);
  assert.match(rows[0].error ?? "", /incomplete or mistyped/); // the placeholder address
  assert.equal(rows[1].error, null);
  assert.equal(rows[1].amount, units("980"));
  assert.equal(rows[1].note, "Invoice 7");
  assert.equal(one("Ada,12.50").amount, units("12.50"));
  assert.equal(one("Ada,,12.50,Sept").note, "Sept");
  assert.equal(one('name,amount\r\nAda,"$1,250.00"\r\n').amount, units("1250"));
});

console.log(`\n${passed} payroll list checks passed`);
