/**
 * $GLOAM holder votes: the configuration. This file is the only place a vote
 * is defined. Pages, the API and Glim all read it.
 *
 * To create and open a vote (the full steps are in scripts/vote-snapshot.mts):
 *  1. Add an entry below with `published: false` and `snapshotBlock: 0`.
 *  2. From app/, run `../mcp/node_modules/.bin/tsx scripts/vote-snapshot.mts <id>`.
 *     It picks a recent Robinhood Chain block, reads every holder's balance at
 *     it, and writes src/lib/vote/snapshots/<id>.json. Put the block it prints
 *     into `snapshotBlock`.
 *  3. Set `start` and `end`, then `published: true`, and ship it.
 *
 * Once a vote is published, never change its id, options (or their order) or
 * snapshot block: every signature names the option it picked, so a change
 * would void the votes already cast. Fix a typo in the question or the
 * description only.
 */

export type VoteConfig = {
  /** The link: gloam.trade/vote/<id>. Lowercase letters, digits and dashes. Never changes once published. */
  id: string;
  /** false keeps the vote off the site and closed to votes. Nothing goes live until this is true. */
  published: boolean;
  /** One plain question. */
  question: string;
  /** One or two short sentences under the question. */
  description: string;
  /** 2 to 5 options, each a few words. The order is fixed once published. */
  options: string[];
  /** One plain line under each option, in the same order. Not signed, so it can be reworded. */
  details?: string[];
  /** The Robinhood Chain mainnet block whose $GLOAM balances set each wallet's weight. 0: not taken yet. */
  snapshotBlock: number;
  /** When voting opens and closes, in UTC, like "2026-11-03T13:00:00Z". */
  start: string;
  end: string;
  /** Extra addresses that never count in this vote, on top of the standing list (lib/vote/excluded.ts). */
  exclude?: { address: string; reason: string }[];
};

/** The first three votes share one window and one snapshot block. */
const FIRST_START = "2026-10-29T16:30:00Z";
// the end of Sunday 1 November, midnight UTC
const FIRST_END = "2026-11-02T00:00:00Z";
const FIRST_BLOCK = 101_022_464;

export const VOTES: VoteConfig[] = [
  {
    id: "private-swaps-next",
    published: true,
    question: "What should Gloam add to private swaps next?",
    description:
      "Private swaps hide who traded, while the token and the amount stay public. The winning option goes on the roadmap first: the result is advisory, and the team will act on it.",
    options: ["More Robinhood stock tokens", "Popular Robinhood Chain tokens", "Stablecoin swaps on Base and Ethereum"],
    details: [
      "Swap privately into more of the stock tokens on Robinhood Chain.",
      "Swap privately into the most traded tokens on Robinhood Chain that are not stocks.",
      "Swap between stablecoins like USDC and USDT privately on Base and Ethereum, where the vault already runs.",
    ],
    snapshotBlock: FIRST_BLOCK,
    start: FIRST_START,
    end: FIRST_END,
  },
  {
    id: "next-chain",
    published: true,
    question: "Which chain should Gloam go live on next?",
    description:
      "Gloam runs on Robinhood Chain, Tempo, Base and Ethereum, and the vault is EVM, so each of these is a chain we can ship to. The result is advisory, and the team will act on it.",
    options: ["Arbitrum", "BNB Chain", "Polygon", "Optimism"],
    details: [
      "An Ethereum layer 2 with deep stablecoin and DeFi activity.",
      "A large EVM chain with heavy USDT use.",
      "An EVM chain used widely for payments and stablecoin transfers.",
      "An Ethereum layer 2 built on the OP Stack, like Base.",
    ],
    snapshotBlock: FIRST_BLOCK,
    start: FIRST_START,
    end: FIRST_END,
  },
  {
    id: "first-integration",
    published: true,
    question: "Which kind of app should Gloam integrate first?",
    description:
      "Gloam is the privacy layer apps plug into, and this tells us where to spend partner time first. The result is advisory, and the team will act on it.",
    options: ["Trading apps", "AI agent platforms", "Payroll and payout tools", "Shopping and cards"],
    details: [
      "Private balances and private swaps inside the apps where people trade.",
      "Agents that pay and get paid privately, within the limits you set.",
      "Teams paying people without putting salaries on the public record.",
      "Paying merchants and topping up cards without showing your balance.",
    ],
    snapshotBlock: FIRST_BLOCK,
    start: FIRST_START,
    end: FIRST_END,
  },
];
