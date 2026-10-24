/**
 * Self-test: /verify states a proof's amount exactly, and an expired proof
 * with a check that could not run does not say it checked out. Also: the
 * saved trading defaults start where Markets opens (the stock list).
 *
 * Review, 24 Oct 2026: amounts went through Number with 6 decimals, so "a
 * private balance of exactly" 1 wei of ETH read "exactly 0" and a large amount
 * lost its last digits; an expired proof whose vault check could not reach
 * the network still said "This proof checked out"; and the Default side and
 * Default market filter in Settings were never applied (both screens froze
 * the value from before settings had loaded, and Markets ignored it).
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-verify-amounts.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { ProofVerdict, amountOf } = await import("../src/components/verify/ProofVerdict");
const { knownTokens } = await import("../src/lib/tokens");
const { DEFAULT_SETTINGS, loadSettings } = await import("../src/lib/settings");
type BalanceProof = import("../src/lib/proofs/types").BalanceProof;
type VerifyResult = import("../src/lib/proofs/types").VerifyResult;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const ETH = "0x0000000000000000000000000000000000000000";
const SIX = knownTokens().find((t) => t.decimals === 6)!;

test("proof amounts keep every unit", () => {
  assert.equal(amountOf("1", ETH), "0.000000000000000001");
  assert.equal(amountOf("600000000000", ETH), "0.0000006");
  assert.equal(amountOf("9007199254740993000000000000000001", ETH), "9,007,199,254,740,993.000000000000000001");
  assert.equal(amountOf("1250000000", SIX.address), "1,250");
  assert.equal(amountOf("1000001", SIX.address), "1.000001");
  assert.equal(amountOf("0", SIX.address), "0");
  assert.equal(amountOf("not a number", SIX.address), "not a number");
});

const proof: BalanceProof = {
  v: 1,
  kind: "balance",
  chainId: 4663,
  pool: "0x39e28cde55cab798874746ac52cb4b5cc99a0194",
  asset: ETH,
  verifier: "Acme",
  expiresAt: 1_790_000_000,
  amount: "1",
  commitment: `0x${"01".repeat(32)}`,
  publicSignals: [],
  proof: {},
} as unknown as BalanceProof;
const verdict = (result: VerifyResult) =>
  renderToStaticMarkup(h(ProofVerdict, { proof, result, checkedAt: 1_790_100_000 })).replace(/&#x27;/g, "'");

test("an expired proof whose checks all ran says it checked out", () => {
  const html = verdict({
    kind: "balance",
    ok: false,
    expired: true,
    checks: [
      { label: "The proof checks out", state: "pass" },
      { label: "Balance is in the vault", state: "pass" },
      { label: "Expired", state: "fail" },
    ],
  } as VerifyResult);
  assert.match(html, />Expired</);
  assert.match(html, /This proof checked out, but it expired/);
  assert.match(html, /exactly 0\.000000000000000001/);
});

test("an expired proof with a check that could not run does not say it checked out", () => {
  const html = verdict({
    kind: "balance",
    ok: false,
    expired: true,
    checks: [
      { label: "The proof checks out", state: "pass" },
      { label: "Balance is in the vault", state: "unknown", detail: "Could not reach the network." },
      { label: "Expired", state: "fail" },
    ],
  } as VerifyResult);
  assert.match(html, />Expired</);
  assert.doesNotMatch(html, /checked out, but/);
  assert.match(html, /not every check could run/);
});

test("Markets opens on the stock list, and a saved default is kept", () => {
  localStorage.clear();
  assert.equal(DEFAULT_SETTINGS.marketFilter, "stocks");
  assert.equal(loadSettings().marketFilter, "stocks");
  localStorage.setItem("gloam_trading_settings", JSON.stringify({ defaultSide: "sell", marketFilter: "onchain" }));
  assert.deepEqual([loadSettings().defaultSide, loadSettings().marketFilter], ["sell", "onchain"]);
  localStorage.setItem("gloam_trading_settings", JSON.stringify({ showUsd: false }));
  assert.equal(loadSettings().marketFilter, "stocks", "settings saved before the filter existed");
  localStorage.setItem("gloam_trading_settings", JSON.stringify({ marketFilter: "meme" }));
  assert.equal(loadSettings().marketFilter, "all", "an old filter still maps as before");
});

console.log(`\n${passed} proof verdict checks passed`);
