/**
 * The private payout job on a local fork, with a readable log.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter gloam-virtuals-acp-provider-example demo:fork
 *   ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com pnpm --filter gloam-virtuals-acp-provider-example demo:fork -- --network robinhood-mainnet
 *
 * Base Sepolia (a testnet) shows the whole job on Virtuals' ACP testnet
 * contract; its escrow pays in Virtuals' own test token, which Gloam's Base
 * Sepolia vault does not take, so the earnings step says so. The Robinhood
 * Chain run forks mainnet, where ACP pays in USDG and Gloam's vault takes USDG,
 * so the provider also adds its earnings privately. Both run only in a local
 * anvil fork with fresh keys: nothing is sent to a live network.
 */
import { runScenario } from "./scenario.mts";

const i = process.argv.indexOf("--network");
const network = (i > 0 ? process.argv[i + 1] : "base") as "base" | "robinhood-mainnet";
if (network !== "base" && network !== "robinhood-mainnet") {
  console.error('--network must be "base" (Base Sepolia) or "robinhood-mainnet".');
  process.exit(2);
}
const upstream =
  network === "base"
    ? process.env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org"
    : process.env.ROBINHOOD_RPC_URL?.trim() || "https://rpc.mainnet.chain.robinhood.com";

const t = Date.now();
const r = await runScenario({ network, upstream, log: (m) => console.log(`  ${m}`) });
console.log("\nResult");
console.log(`  network                 ${r.network}`);
console.log(`  ACP job                 ${r.jobId}, status ${r.acpStatus} (3 = completed), budget ${r.quoteBudget}`);
console.log(`  escrow paid provider    ${r.providerEscrowIncome}`);
console.log(`  payouts                 ${r.payouts.map((p) => `${p.amount} to ${p.to}: ${p.status}`).join("; ")}`);
console.log(`  proofs check out        ${r.proofsOk.join(", ")}`);
console.log(`  recipient 1             ${r.recipientReceived}`);
console.log(`  recipient 2 (claim)     ${r.claimed}`);
console.log(`  earnings                ${JSON.stringify(r.earnings)}`);
console.log(`  deliverable sealed      ${r.deliverableSealed}`);
console.log(`  ACP backend stores      ${r.backendSaw}`);
console.log(`  refused job             ${r.refusedJob ? `${r.refusedJob.jobId}: "${r.refusedJob.reason}", ${r.refusedJob.detail}` : "none"}`);
console.log(`  payout event fields     ${JSON.stringify(r.transferLogFields)} (no amount, no sender, no recipient)`);
console.log("\nWhat the chain shows");
for (const x of r.publicTxs) console.log(`  ${x.hash}  ${x.what}`);
console.log(`  done in ${Math.round((Date.now() - t) / 1000)}s`);
process.exit(0);
