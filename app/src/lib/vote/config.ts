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
  /** The Robinhood Chain mainnet block whose $GLOAM balances set each wallet's weight. 0: not taken yet. */
  snapshotBlock: number;
  /** When voting opens and closes, in UTC, like "2026-11-03T13:00:00Z". */
  start: string;
  end: string;
  /** Extra addresses that never count in this vote, on top of the standing list (lib/vote/excluded.ts). */
  exclude?: { address: string; reason: string }[];
};

export const VOTES: VoteConfig[] = [
  {
    // DRAFT: a placeholder. The founder picks the real question before it goes live.
    id: "private-swaps-next",
    published: false,
    question: "Which should Gloam add to private swaps next?",
    description: "Private swaps run from your private balance today. Pick what you want to swap into next.",
    options: ["Stock tokens", "ETH", "More stablecoins"],
    snapshotBlock: 0,
    start: "2026-11-03T13:00:00Z",
    end: "2026-11-10T13:00:00Z",
  },
];
