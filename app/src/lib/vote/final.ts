/**
 * The final count of a close-weighted vote (see lib/vote/config): every
 * voter's $GLOAM at the closing block, the first block at or after the vote's
 * end, worked out by replaying the GLOAM Transfer logs from the checked
 * snapshot to that block. Server only.
 *
 * Nothing has to run on a timer: the first results request after the close
 * (and a short grace for votes still being saved) works it out and stores
 * it, and every request after that reads the stored count.
 * scripts/vote-final.mts does the same by hand. Working it out again gives
 * the same numbers, and a stored count is never replaced.
 */
import "server-only";
import type { Hex } from "viem";
import { jsonOf, kv } from "../partnersKv";
import type { VoteConfig } from "./config";
import {
  GLOAM_FIRST_BLOCK,
  GLOAM_TOKEN_ADDRESS,
  VOTE_CHAIN_ID,
  eligibleTotal,
  latestPerVoter,
  recount,
  replayTransfers,
  weightingOf,
  type Ballot,
  type FinalWeights,
  type VoteMessage,
  type VoteSnapshot,
} from "./core";
import type { Excluded } from "./excluded";
import { firstBlockAtOrAfter, voteChain, type VoteChain } from "./chainReads";
import { listBallots } from "./store";

const PREFIX = "gloam:vote:v1:";
const finalKey = (voteId: string) => `${PREFIX}${voteId}:final`;
const lockKey = (voteId: string) => `${PREFIX}${voteId}:final:lock`;

/** How long after the end the count waits, so a vote taken in the last second has landed. */
export const FINAL_GRACE_MS = 2 * 60_000;
/** One instance works it out at a time; the lock lapses on its own if that instance dies. */
const LOCK_SEC = 90;

/** A stored count never changes, so each instance keeps it once read. */
const memo = new Map<string, FinalWeights>();

/** Self-tests only. */
export function clearFinalCache() {
  memo.clear();
}

/** The stored final count, or null when there isn't one yet. */
export async function storedFinal(voteId: string): Promise<FinalWeights | null> {
  const hit = memo.get(voteId);
  if (hit) return hit;
  const [raw] = await kv([["GET", finalKey(voteId)]]);
  const f = jsonOf<FinalWeights>(raw);
  if (f) memo.set(voteId, f);
  return f;
}

export type FinalDeps = {
  chain?: VoteChain | null;
  contractCheck?: (message: VoteMessage, signature: Hex) => Promise<boolean>;
  /** ms */
  now?: number;
};

/**
 * Works out the final count from the chain and the ballots, without storing
 * it. `base` is a checked snapshot before the close to replay from; without
 * one the replay starts at the token's launch.
 */
export async function computeFinal(
  v: VoteConfig,
  ballots: Ballot[],
  excluded: Map<string, Excluded>,
  base: VoteSnapshot | null,
  deps: FinalDeps = {},
): Promise<FinalWeights> {
  const chain = deps.chain === undefined ? voteChain() : deps.chain;
  if (!chain) throw new Error("chain reads are off");
  const endSec = Math.ceil(Date.parse(v.end) / 1000);
  const from = base && base.blockTime < endSec ? base : null;
  const close = await firstBlockAtOrAfter(chain, endSec, from ? from.block : GLOAM_FIRST_BLOCK);
  const logs = await chain.transferLogs(from ? from.block + 1 : GLOAM_FIRST_BLOCK, close.number);
  const all = replayTransfers(logs, close.number, from ? { block: from.block, balances: from.balances } : undefined);
  const balancesAtClose = Object.fromEntries([...all].map(([a, b]) => [a, b.toString()]));

  const latest = latestPerVoter(ballots);
  const voters = [...new Set(latest.map((b) => b.voter.toLowerCase()))].sort();
  const voterBalances = Object.fromEntries(voters.map((a) => [a, all.get(a)?.toString() ?? "0"]));

  // read the voters' balances again at the block while the RPC still has its state there
  let checked: FinalWeights["checked"] = null;
  if (voters.length) {
    const onChain = await chain.balances(voters, close.number).catch(() => null);
    if (onChain) {
      const mismatches = voters.filter((a) => (onChain.get(a) ?? 0n).toString() !== voterBalances[a]).length;
      if (mismatches) throw new Error(`${mismatches} voter balances at block ${close.number} differ from the Transfer replay`);
      checked = { balanceOf: voters.length, mismatches: 0 };
    }
  }

  const r = await recount(v, { balances: balancesAtClose, block: close.number }, excluded, latest, deps.contractCheck, { closeBlock: close.number });
  const eligible = eligibleTotal({ balances: balancesAtClose }, excluded);
  // a stable order, so the stored count is the same however the ballots were listed
  const counted = [...r.counted].sort((a, b) => a.voter.toLowerCase().localeCompare(b.voter.toLowerCase()));
  const problems = [...r.problems].sort((a, b) => a.voter.toLowerCase().localeCompare(b.voter.toLowerCase()) || a.problem.localeCompare(b.problem));
  return {
    voteId: v.id,
    chainId: VOTE_CHAIN_ID,
    token: GLOAM_TOKEN_ADDRESS,
    end: v.end,
    closeBlock: close.number,
    closeBlockHash: close.hash,
    closeBlockTime: close.time,
    replayFrom: from ? from.block : 0,
    logs: logs.length,
    computedAt: new Date(deps.now ?? Date.now()).toISOString(),
    balances: voterBalances,
    eligible: { weight: eligible.weight.toString(), wallets: eligible.wallets },
    checked,
    counted,
    problems,
    totals: {
      weight: r.tally.weight.toString(),
      wallets: r.tally.wallets,
      options: r.tally.options.map((o) => ({ ...o, weight: o.weight.toString() })),
    },
  };
}

/** Whether the final count may be worked out at `now` (ms). */
export function finalDue(v: VoteConfig, now: number = Date.now()): boolean {
  return weightingOf(v) === "close" && v.published && now >= Date.parse(v.end) + FINAL_GRACE_MS;
}

/**
 * The final count, working it out and storing it the first time it is due.
 * Returns null before then, while another instance is working it out, or when
 * the chain can't be read (the next request tries again). Idempotent: a
 * stored count is returned as it is, and never replaced.
 */
export async function ensureFinal(
  v: VoteConfig,
  excluded: Map<string, Excluded>,
  base: VoteSnapshot | null,
  deps: FinalDeps = {},
): Promise<FinalWeights | null> {
  if (weightingOf(v) !== "close") return null;
  const stored = await storedFinal(v.id);
  if (stored) return stored;
  if (!finalDue(v, deps.now)) return null;
  const [got] = await kv([["SET", lockKey(v.id), "1", "NX", "EX", LOCK_SEC]]);
  if (got === null) return null;
  try {
    const f = await computeFinal(v, await listBallots(v.id), excluded, base, deps);
    // first one wins; whatever is stored is what everyone reads
    await kv([["SET", finalKey(v.id), JSON.stringify(f), "NX"]]);
    memo.delete(v.id);
    return await storedFinal(v.id);
  } catch (e) {
    console.error(`[vote] final count for ${v.id} failed:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    await kv([["DEL", lockKey(v.id)]]).catch(() => {});
  }
}
