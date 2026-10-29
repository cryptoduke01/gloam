/**
 * Which votes exist and which can be seen, with their snapshots. Server only:
 * the snapshots are large and stay out of the browser bundle.
 *
 * A vote shows on the site only once `published` is true in lib/vote/config.
 * GLOAM_VOTE_PREVIEW=1 (server env, for a local or preview build) also shows
 * drafts and takes votes on them inside their window, so the founder can try
 * one before it goes live. Production never sets it.
 */
import "server-only";
import { VOTES, type VoteConfig } from "./config";
import { configProblems, inWindow, voteStatus, type VoteSnapshot, type VoteStatus } from "./core";
import { excludedFor, type Excluded } from "./excluded";
import { SNAPSHOTS } from "./snapshots";

export function votePreview(): boolean {
  return process.env.GLOAM_VOTE_PREVIEW?.trim() === "1";
}

/** A vote the site may show: published, or any valid vote in preview. */
export function findVote(id: string, all: VoteConfig[] = VOTES): VoteConfig | null {
  const v = all.find((x) => x.id === id);
  if (!v || configProblems(v).length > 0) return null;
  return v.published || votePreview() ? v : null;
}

/** Every vote the site may show, open first, then upcoming, then closed (newest first). */
export function visibleVotes(all: VoteConfig[] = VOTES, now: number = Date.now()): VoteConfig[] {
  const rank: Record<VoteStatus, number> = { open: 0, draft: 1, upcoming: 2, closed: 3 };
  return all
    .filter((v) => findVote(v.id, all) !== null)
    .sort((a, b) => rank[voteStatus(a, now)] - rank[voteStatus(b, now)] || Date.parse(b.end) - Date.parse(a.end));
}

/** The vote's snapshot, only when it is for this vote and its block. */
export function snapshotFor(v: VoteConfig, all: Record<string, VoteSnapshot> = SNAPSHOTS): VoteSnapshot | null {
  const s = all[v.id];
  if (!s || s.voteId !== v.id || s.block !== v.snapshotBlock || v.snapshotBlock === 0) return null;
  if (s.checked && s.checked.mismatches !== 0) return null;
  return s;
}

/** Whether a vote takes votes at `now`: visible, its snapshot in, and inside its window. */
export function acceptingVotes(v: VoteConfig, snapshot: VoteSnapshot | null, now: number = Date.now()): boolean {
  if (!snapshot) return false;
  if (!v.published && !votePreview()) return false;
  return inWindow(v, now);
}

export function excludedForVote(v: VoteConfig): Map<string, Excluded> {
  return excludedFor(v.exclude);
}
