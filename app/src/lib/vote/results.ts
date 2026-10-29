/**
 * What the vote page and the public API show: the vote, live totals, one
 * wallet's standing, and the full list of signed votes for a recount. Server
 * only. Amounts are wei strings so nothing is rounded on the way out.
 */
import "server-only";
import type { VoteConfig } from "./config";
import {
  GLOAM_TOKEN_ADDRESS,
  VOTE_CHAIN_ID,
  VOTE_DOMAIN,
  VOTE_TYPES,
  eligibleTotal,
  percentOf,
  tally,
  voteStatus,
  weightOf,
  type Ballot,
  type VoteSnapshot,
  type VoteStatus,
} from "./core";
import type { Excluded } from "./excluded";
import { acceptingVotes } from "./registry";
import { cachedBallots, getBallot } from "./store";

export type VoteSummary = {
  id: string;
  draft: boolean;
  question: string;
  description: string;
  options: string[];
  details: string[];
  status: VoteStatus;
  start: string;
  end: string;
  chainId: number;
  token: string;
  snapshotBlock: number;
  snapshotReady: boolean;
  accepting: boolean;
  eligible: { weight: string; wallets: number } | null;
  totals: {
    weight: string;
    wallets: number;
    options: { option: number; label: string; weight: string; wallets: number; percent: number }[];
  };
  excluded: { address: string; reason: string }[];
  updatedAt: number;
};

export type VoterStanding = {
  address: string;
  held: string;
  weight: string;
  excluded: string | null;
  ballot: Ballot | null;
};

function excludedList(excluded: Map<string, Excluded>) {
  return [...excluded.values()].map((e) => ({ address: e.address, reason: e.reason }));
}

export async function voteSummary(
  v: VoteConfig,
  snapshot: VoteSnapshot | null,
  excluded: Map<string, Excluded>,
  now: number = Date.now(),
  opts: { tolerateStore?: boolean } = {},
): Promise<VoteSummary> {
  // the page still renders the vote when the store is down (with empty totals the client fills in later); the API says 503
  const read = snapshot ? cachedBallots(v.id, now) : Promise.resolve([]);
  const ballots = opts.tolerateStore ? await read.catch(() => []) : await read;
  const t = tally(v, ballots);
  const eligible = snapshot ? eligibleTotal(snapshot, excluded) : null;
  return {
    id: v.id,
    draft: !v.published,
    question: v.question,
    description: v.description,
    options: v.options,
    details: v.details ?? v.options.map(() => ""),
    status: voteStatus(v, now),
    start: v.start,
    end: v.end,
    chainId: VOTE_CHAIN_ID,
    token: GLOAM_TOKEN_ADDRESS,
    snapshotBlock: v.snapshotBlock,
    snapshotReady: snapshot !== null,
    accepting: acceptingVotes(v, snapshot, now),
    eligible: eligible ? { weight: eligible.weight.toString(), wallets: eligible.wallets } : null,
    totals: {
      weight: t.weight.toString(),
      wallets: t.wallets,
      options: t.options.map((o) => ({ ...o, weight: o.weight.toString(), percent: percentOf(o.weight, t.weight) })),
    },
    excluded: excludedList(excluded),
    updatedAt: now,
  };
}

export async function voterStanding(
  v: VoteConfig,
  snapshot: VoteSnapshot,
  excluded: Map<string, Excluded>,
  address: string,
): Promise<VoterStanding> {
  const { weight, held, excluded: ex } = weightOf(snapshot, excluded, address);
  return {
    address,
    held: held.toString(),
    weight: weight.toString(),
    excluded: ex?.reason ?? null,
    ballot: await getBallot(v.id, address),
  };
}

/** Everything a recount needs, as one JSON document. */
export async function ballotsExport(v: VoteConfig, snapshot: VoteSnapshot | null, excluded: Map<string, Excluded>) {
  const ballots = snapshot ? await cachedBallots(v.id) : [];
  return {
    vote: { id: v.id, question: v.question, options: v.options, start: v.start, end: v.end, snapshotBlock: v.snapshotBlock },
    chainId: VOTE_CHAIN_ID,
    token: GLOAM_TOKEN_ADDRESS,
    snapshot: snapshot ? { block: snapshot.block, blockHash: snapshot.blockHash, blockTime: snapshot.blockTime } : null,
    howToCheck:
      "Each signature is EIP-712 over typedData with message { vote, option, choice, voter, snapshotBlock, timestamp }. A wallet's weight is its $GLOAM balanceOf at snapshot.block on Robinhood Chain (4663), zero for the excluded addresses. Each wallet's latest timestamp counts.",
    typedData: { domain: VOTE_DOMAIN, types: VOTE_TYPES, primaryType: "Vote" },
    excluded: excludedList(excluded),
    ballots,
  };
}

/** The votes as a spreadsheet. Cells that start like a formula are quoted as text. */
export function ballotsCsv(ballots: Ballot[]): string {
  const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const header = ["voter", "option", "choice", "weight_wei", "signed_at_utc", "timestamp", "signature"];
  const rows = ballots.map((b) =>
    [b.voter, String(b.option), b.choice, b.weight, new Date(b.timestamp * 1000).toISOString(), String(b.timestamp), b.signature].map(cell),
  );
  return [header.map(cell), ...rows].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
