/**
 * What the Telegram helper keeps, in the partner program's store
 * (lib/partnersKv: Upstash Redis in production, in-process locally) under its
 * own prefix. Server only.
 *
 *  - seen updates, for a few minutes, so a retried webhook is handled once
 *  - the last few messages of each topic (first name and text, never anything
 *    that looks like a secret), for about six hours, so follow-ups make sense
 *  - new members waiting for the next batched welcome
 *  - bug reports, for the admin dashboard
 */
import { randomUUID } from "crypto";
import { jsonOf, kv } from "@/lib/partnersKv";
import type { ChatLine, Joiner } from "./rules";

const PREFIX = "gloam:tg:v1:";
const SEEN_TTL_SEC = 10 * 60;
const THREAD_KEEP = 12;
const THREAD_TTL_SEC = 6 * 60 * 60;
const PENDING = `${PREFIX}welcome:pending`;
const COOLDOWN = `${PREFIX}welcome:cooldown`;
/** At most one welcome this often. */
export const WELCOME_EVERY_SEC = 10 * 60;
const WELCOMED_TTL_SEC = 24 * 60 * 60;
const PENDING_MAX = 200;
const BUGS = `${PREFIX}bugs`;
const BUGS_MAX = 500;

const threadKey = (chatId: number, topic: number) => `${PREFIX}thread:${chatId}:${topic}`;

/**
 * Marks an update as seen. `fresh` is false for a repeat. Also says whether
 * new members are waiting for a welcome, in the same round trip.
 */
export async function markSeen(updateId: number): Promise<{ fresh: boolean; welcomePending: boolean }> {
  const [set, pending] = await kv([
    ["SET", `${PREFIX}seen:${updateId}`, "1", "EX", SEEN_TTL_SEC, "NX"],
    ["LRANGE", PENDING, 0, 0],
  ]);
  return { fresh: set !== null, welcomePending: Array.isArray(pending) && pending.length > 0 };
}

/**
 * The topic's recent lines, oldest first, then adds `line` to it. Reading
 * first keeps the new message out of its own history.
 */
export async function threadThenRemember(chatId: number, topic: number, line: ChatLine | null): Promise<ChatLine[]> {
  const key = threadKey(chatId, topic);
  const cmds: (string | number)[][] = [["LRANGE", key, 0, THREAD_KEEP - 1]];
  if (line) cmds.push(["LPUSH", key, JSON.stringify(line)], ["LTRIM", key, 0, THREAD_KEEP - 1], ["EXPIRE", key, THREAD_TTL_SEC]);
  const [raw] = await kv(cmds);
  const lines = (Array.isArray(raw) ? raw : []).map((r) => jsonOf<ChatLine>(r)).filter((l): l is ChatLine => Boolean(l?.n && l?.t));
  return lines.reverse();
}

/** Adds one line (the helper's own reply) to a topic's history. */
export async function remember(chatId: number, topic: number, line: ChatLine): Promise<void> {
  const key = threadKey(chatId, topic);
  await kv([
    ["LPUSH", key, JSON.stringify(line)],
    ["LTRIM", key, 0, THREAD_KEEP - 1],
    ["EXPIRE", key, THREAD_TTL_SEC],
  ]);
}

/** Queues new members for the next welcome. Someone who joins twice in a day is welcomed once. */
export async function queueJoiners(joiners: Joiner[]): Promise<number> {
  if (joiners.length === 0) return 0;
  const claims = await kv(joiners.map((j) => ["SET", `${PREFIX}welcomed:${j.id}`, "1", "EX", WELCOMED_TTL_SEC, "NX"]));
  const fresh = joiners.filter((_, i) => claims[i] !== null);
  if (fresh.length === 0) return 0;
  await kv([
    ...fresh.map((j) => ["LPUSH", PENDING, JSON.stringify(j)]),
    ["LTRIM", PENDING, 0, PENDING_MAX - 1],
    ["EXPIRE", PENDING, WELCOMED_TTL_SEC],
  ]);
  return fresh.length;
}

/**
 * The members to welcome now, oldest first, or null while the last welcome is
 * under ten minutes old or nobody is waiting. Taking a batch starts the next
 * ten minutes.
 */
export async function takeWelcomeBatch(): Promise<Joiner[] | null> {
  const [slot] = await kv([["SET", COOLDOWN, "1", "EX", WELCOME_EVERY_SEC, "NX"]]);
  if (slot === null) return null;
  const [raw] = await kv([["LRANGE", PENDING, 0, -1]]);
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) {
    await kv([["DEL", COOLDOWN]]);
    return null;
  }
  // drop exactly what was read; anyone queued meanwhile sits at the head and waits for the next batch
  await kv([["LTRIM", PENDING, 0, -(items.length + 1)]]);
  return items
    .map((r) => jsonOf<Joiner>(r))
    .filter((j): j is Joiner => Boolean(j && typeof j.id === "number"))
    .reverse();
}

export type BugReport = {
  id: string;
  userId: number;
  username: string | null;
  firstName: string;
  /** Topic name, or "Direct message". */
  thread: string;
  text: string;
  /** Link to the message in the group, when it has one. */
  link: string | null;
  createdAt: number;
};

/** Saves a bug report for the admin dashboard. */
export async function saveBugReport(input: Omit<BugReport, "id" | "createdAt">): Promise<BugReport> {
  const report: BugReport = { ...input, id: randomUUID(), text: input.text.slice(0, 2_000), createdAt: Date.now() };
  await kv([
    ["LPUSH", BUGS, JSON.stringify(report)],
    ["LTRIM", BUGS, 0, BUGS_MAX - 1],
  ]);
  return report;
}

/** Bug reports, newest first. */
export async function listBugReports(limit = BUGS_MAX): Promise<BugReport[]> {
  const [raw] = await kv([["LRANGE", BUGS, 0, limit - 1]]);
  return (Array.isArray(raw) ? raw : []).map((r) => jsonOf<BugReport>(r)).filter((r): r is BugReport => r !== null);
}
