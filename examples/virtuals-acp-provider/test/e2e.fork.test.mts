/**
 * The private payout job end to end on a fork (see scripts/scenario.mts).
 * Skipped without BASE_SEPOLIA_RPC_URL; the Robinhood Chain mainnet fork runs
 * too when ROBINHOOD_RPC_URL is set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findAnvil } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { runScenario, type ScenarioReport } from "../scripts/scenario.mts";

const anvil = findAnvil();
const base = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const rh = process.env.ROBINHOOD_RPC_URL?.trim();

function common(r: ScenarioReport, symbol: string) {
  assert.equal(r.acpStatus, 3, "the job completed on the ACP contract");
  assert.equal(r.principalToProvider, "10", "the payout total reached the provider at funding, outside the escrow");
  assert.ok(Number(r.escrowPaidProvider) >= 0.05, `the escrow paid at least the 0.05 fee after ACP's cut (${r.escrowPaidProvider})`);
  assert.equal(r.payouts.length, 2);
  assert.ok(r.payouts.every((p) => p.status === "paid"));
  assert.deepEqual(r.proofsOk, [true, true]);
  assert.equal(r.recipientReceived, `7 ${symbol} (swept, note "march retainer")`);
  assert.equal(r.claimed, `3 ${symbol} (swept)`);
  assert.equal(r.deliverableSealed, true);
  assert.ok(!/gloamr1|claim|retainer|bounty/.test(r.backendSaw), "the ACP backend stores only the sealed deliverable");
  assert.deepEqual(r.transferLogFields, [["nullifier", "newCommitments"], ["nullifier", "newCommitments"]]);
  assert.match(String(r.refusedJob?.reason), /no evaluator/);
  assert.equal(r.rejectedAfterFunding?.acpStatus, 4, "the client rejected the funded job on chain");
  assert.equal(r.rejectedAfterFunding?.payoutsMade, 0, "nothing was paid out for a rejected job");
  assert.match(String(r.rejectedAfterFunding?.journal), /principal sent back/);
  assert.match(String(r.rejectedAfterFunding?.clientNetChange), new RegExp(`^0 ${symbol}`), "the client got its principal and fee back");
  const added = r.earnings?.results.find((x) => x.status === "added");
  assert.equal(added?.added, `10 ${symbol}`, "the principal that reached the wallet was added privately, in a round amount");
}

test("private payout on a Base Sepolia fork: real ACP escrow, fund transfer, private payouts, sealed deliverable", { skip: !base ? "set BASE_SEPOLIA_RPC_URL" : !anvil ? "anvil not found" : false, timeout: 20 * 60_000 }, async () => {
  const r = await runScenario({ network: "base", upstream: base!, log: (m) => console.log(`  ${m}`) });
  common(r, "USDC");
  // Virtuals' Base Sepolia escrow takes the fee in its own test token, which Gloam's vault does not list.
  assert.match(String(r.earnings?.results.find((x) => x.status === "skipped")?.reason), /not a token Gloam/);
});

test("private payout on a Robinhood Chain mainnet fork: both legs in USDG", { skip: !rh ? "set ROBINHOOD_RPC_URL" : !anvil ? "anvil not found" : false, timeout: 20 * 60_000 }, async () => {
  const r = await runScenario({ network: "robinhood-mainnet", upstream: rh!, log: (m) => console.log(`  ${m}`) });
  common(r, "USDG");
});
