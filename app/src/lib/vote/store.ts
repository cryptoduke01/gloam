/**
 * Signed votes, kept in the app's store (lib/partnersKv: Upstash Redis in
 * production, in-process for local runs and the self-test). Server only.
 *
 * One record per wallet per vote: its latest signed ballot, signature and
 * all, so anyone can check it again. Nothing private is kept: no IP address,
 * no browser details, only what the wallet signed and the weight it carries.
 */
import "server-only";
import { kv, jsonOf } from "../partnersKv";
import type { Ballot } from "./core";

const PREFIX = "gloam:vote:v1:";
const ballotKey = (voteId: string, voter: string) => `${PREFIX}${voteId}:ballot:${voter.toLowerCase()}`;
const votersKey = (voteId: string) => `${PREFIX}${voteId}:voters`;
const lockKey = (voteId: string, voter: string) => `${PREFIX}${voteId}:lock:${voter.toLowerCase()}`;

/** A save of this wallet's vote is already running. */
export class BallotBusyError extends Error {
  constructor() {
    super("ballot busy");
    this.name = "BallotBusyError";
  }
}

export async function getBallot(voteId: string, voter: string): Promise<Ballot | null> {
  const [raw] = await kv([["GET", ballotKey(voteId, voter)]]);
  return jsonOf<Ballot>(raw);
}

/**
 * Keeps `ballot` when it is newer (a later signed timestamp) than the one
 * this wallet has in. Returns what is in now and whether it changed. A short
 * per-wallet lock keeps two saves from crossing, so an older signature never
 * lands over a newer one.
 */
export async function saveBallot(voteId: string, ballot: Ballot): Promise<{ saved: boolean; previous: Ballot | null; current: Ballot }> {
  const [got] = await kv([["SET", lockKey(voteId, ballot.voter), "1", "NX", "EX", 10]]);
  if (got === null) throw new BallotBusyError();
  try {
    const previous = await getBallot(voteId, ballot.voter);
    if (previous && previous.timestamp >= ballot.timestamp) return { saved: false, previous, current: previous };
    await kv([
      ["SET", ballotKey(voteId, ballot.voter), JSON.stringify(ballot)],
      ["SADD", votersKey(voteId), ballot.voter.toLowerCase()],
    ]);
    resultsCache.delete(voteId);
    return { saved: true, previous, current: ballot };
  } finally {
    await kv([["DEL", lockKey(voteId, ballot.voter)]]).catch(() => {});
  }
}

const CHUNK = 500;

/** Every wallet's latest ballot for a vote, oldest first. */
export async function listBallots(voteId: string): Promise<Ballot[]> {
  const [members] = await kv([["SMEMBERS", votersKey(voteId)]]);
  const voters = Array.isArray(members) ? members.map(String) : [];
  const out: Ballot[] = [];
  for (let i = 0; i < voters.length; i += CHUNK) {
    const raws = await kv(voters.slice(i, i + CHUNK).map((v) => ["GET", ballotKey(voteId, v)]));
    for (const r of raws) {
      const b = jsonOf<Ballot>(r);
      if (b) out.push(b);
    }
  }
  return out.sort((a, b) => a.receivedAt - b.receivedAt);
}

/** A few seconds of reuse per server instance, so a busy results page doesn't read every ballot each time. */
const RESULTS_TTL_MS = 4_000;
const resultsCache = new Map<string, { at: number; ballots: Promise<Ballot[]> }>();

export function cachedBallots(voteId: string, now: number = Date.now()): Promise<Ballot[]> {
  const hit = resultsCache.get(voteId);
  if (hit && now - hit.at < RESULTS_TTL_MS) return hit.ballots;
  const ballots = listBallots(voteId);
  resultsCache.set(voteId, { at: now, ballots });
  ballots.catch(() => resultsCache.delete(voteId));
  return ballots;
}

/** Self-tests only. */
export function clearBallotCache() {
  resultsCache.clear();
}
