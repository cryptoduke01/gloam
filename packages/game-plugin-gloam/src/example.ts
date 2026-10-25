/**
 * A GAME agent with a private balance. Run with:
 *
 *   GAME_API_KEY=apt-... \
 *   GLOAM_NETWORK=base GLOAM_AGENT_PRIVATE_KEY=0x... GLOAM_LIMITS_FILE=./limits.example.json \
 *   pnpm --filter @gloamtrade/game-plugin-gloam example
 *
 * GLOAM_NETWORK=base is Base Sepolia, a testnet (limits.example.json names its
 * USDC and ETH). For mainnet use robinhood-mainnet, whose vault takes USDG, or
 * base-mainnet once its vault is live, with a limits file for those assets.
 */
import { GameAgent } from "@virtuals-protocol/game";
import GloamPlugin, { resolveNetwork } from "./index.js";

// Limits come from GLOAM_LIMITS_FILE when it is set; the plugin refuses limits in
// code and a file together, so the code ones are only a fallback when there is no file.
const network = process.env.GLOAM_NETWORK?.trim() || "base";
const first = resolveNetwork(network).assets[0]!.symbol;
const fromFile = Boolean(process.env.GLOAM_LIMITS_FILE?.trim());
console.log(fromFile ? `limits: ${process.env.GLOAM_LIMITS_FILE}` : `limits: none in GLOAM_LIMITS_FILE, so 5 ${first} a payment and 20 a day`);

const gloam = new GloamPlugin({
  network,
  ...(fromFile ? {} : { limits: { recipients: "any", assets: { [first]: { maxPerPayment: "5", maxPerDay: "20" } } } }),
  // Claim links are bearer secrets: deliver them yourself, never through the planner.
  onClaimLink: (c) => console.log(`[owner] claim link ${c.handle} for ${c.amount} ${c.asset} is ready to deliver`),
});

const agent = new GameAgent(process.env.GAME_API_KEY ?? "", {
  name: "Private Treasurer",
  goal: "Keep the agent's earnings private, pay suppliers privately, and prove funds when a counterparty asks.",
  description: "An agent that pays and gets paid with Gloam, so its payments and balance are not public.",
  workers: [gloam.getWorker()],
});

(async () => {
  agent.setLogger((a, msg) => console.log(`-----[${a.name}]-----\n${msg}\n`));
  await agent.init();
  await agent.run(10, { verbose: true });
})();
