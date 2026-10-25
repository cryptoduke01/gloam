/**
 * A GAME agent with a private balance. Run with:
 *
 *   GAME_API_KEY=apt-... \
 *   GLOAM_NETWORK=base GLOAM_AGENT_PRIVATE_KEY=0x... GLOAM_LIMITS_FILE=./limits.json \
 *   pnpm --filter @gloamtrade/game-plugin-gloam example
 *
 * GLOAM_NETWORK=base is Base Sepolia, a testnet. For mainnet use
 * robinhood-mainnet (USDG) or base-mainnet once its vault is live.
 */
import { GameAgent } from "@virtuals-protocol/game";
import GloamPlugin from "./index.js";

const gloam = new GloamPlugin({
  // Limits can also come from GLOAM_LIMITS_FILE. Each asset has its own caps.
  limits: {
    recipients: "any",
    assets: { USDC: { maxPerPayment: "5", maxPerDay: "20" } },
  },
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
