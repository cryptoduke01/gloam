import type { VoteConfig } from "./config";
import { voteStatus, whenPhrase } from "./core";

/** For link previews: "Closes Sunday 1 Nov, 11pm UTC", "Opens ...", or "Results are in". */
export function voteTimeLine(v: VoteConfig, now: number = Date.now()): string {
  const status = voteStatus(v, now);
  if (status === "closed") return "Results are in";
  const when = (iso: string) => whenPhrase(iso).replace(" at ", ", ");
  if (status === "upcoming") return `Opens ${when(v.start)}`;
  return `Closes ${when(v.end)}`;
}

/** The line for every vote together: the soonest close among the open ones. */
export function votesTimeLine(votes: VoteConfig[], now: number = Date.now()): string {
  const open = votes.filter((v) => voteStatus(v, now) === "open").sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  if (open[0]) return voteTimeLine(open[0], now);
  const upcoming = votes.filter((v) => voteStatus(v, now) === "upcoming").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (upcoming[0]) return voteTimeLine(upcoming[0], now);
  return "Results are in";
}
