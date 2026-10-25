/**
 * The private payout job end to end on a fork (see scripts/scenario.mts).
 * Skipped without BASE_SEPOLIA_RPC_URL; the Robinhood Chain mainnet fork runs
 * too when ROBINHOOD_RPC_URL is set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findAnvil } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { runScenario } from "../scripts/scenario.mts";

const anvil = findAnvil();
const base = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const rh = process.env.ROBINHOOD_RPC_URL?.trim();

test("private payout on a Base Sepolia fork: real ACP escrow, private payouts, sealed deliverable", { skip: !base ? "set BASE_SEPOLIA_RPC_URL" : !anvil ? "anvil not found" : false, timeout: 20 * 60_000 }, async () => {
  const r = await runScenario({ network: "base", upstream: base!, log: (m) => console.log(`  ${m}`) });
  assert.equal(r.acpStatus, 3, "the job completed on the ACP contract");
  assert.equal(r.payouts.length, 2);
  assert.ok(r.payouts.every((p) => p.status === "paid"));
  assert.deepEqual(r.proofsOk, [true, true]);
  assert.match(String(r.recipientReceived), /^7 USDC \(swept, note "march retainer"\)$/);
  assert.match(String(r.claimed), /^3 USDC \(swept\)$/);
  assert.equal(r.deliverableSealed, true);
  assert.ok(!/gloamr1|claim|retainer|bounty/.test(r.backendSaw), "the ACP backend stores only the sealed deliverable");
  assert.deepEqual(r.transferLogFields, [["nullifier", "newCommitments"], ["nullifier", "newCommitments"]]);
  // Virtuals' Base Sepolia escrow pays in its own test token, which Gloam's Base Sepolia vault does not list.
  assert.equal(r.earnings?.status, "skipped");
  assert.match(String(r.earnings?.reason), /does not take/);
});

test("private payout on a Robinhood Chain mainnet fork: ACP pays USDG and the provider adds it privately", { skip: !rh ? "set ROBINHOOD_RPC_URL" : !anvil ? "anvil not found" : false, timeout: 20 * 60_000 }, async () => {
  const r = await runScenario({ network: "robinhood-mainnet", upstream: rh!, log: (m) => console.log(`  ${m}`) });
  assert.equal(r.acpStatus, 3);
  assert.deepEqual(r.proofsOk, [true, true]);
  assert.equal(r.earnings?.status, "added", JSON.stringify(r.earnings));
});
