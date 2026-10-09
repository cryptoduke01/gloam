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
 *  - counters for the owner's report: hourly buckets kept three days, the
 *    people active, joining and leaving each hour, escalations, and the
 *    question texts (48 hours, about 100 a day, never anything secret-shaped)
 *  - the owner's private chat, so a scheduled report knows where to go
 */
import { randomUUID } from "crypto";
import { hashNumbers, jsonOf, kv } from "@/lib/partnersKv";
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

// ---------------------------------------------------------------- owner report

const HOUR_MS = 3_600_000;
/** WAT (Africa/Lagos) is UTC+1 all year, no daylight saving. */
const WAT_OFFSET_MS = HOUR_MS;
const STATS_TTL_SEC = 3 * 24 * 60 * 60;
const QUESTIONS_TTL_SEC = 48 * 60 * 60;
const QUESTIONS_PER_DAY = 100;
const ESCALATIONS = `${PREFIX}escalations`;
const ESCALATIONS_MAX = 100;
const OWNER_CHATS = `${PREFIX}owner:chats`;

const hourOf = (now: number) => Math.floor(now / HOUR_MS);
const watDay = (now: number) => Math.floor((now + WAT_OFFSET_MS) / 86_400_000);
const statsKey = (hour: number) => `${PREFIX}stats:${hour}`;
const peopleKey = (kind: "active" | "joins" | "leaves", hour: number) => `${PREFIX}${kind}:${hour}`;
const questionsKey = (day: number) => `${PREFIX}questions:${day}`;

/** Things the helper does, counted per hour. */
export type Counter = "answered" | "welcomes" | "scams" | "scamsMissed" | "secrets" | "secretsMissed";

export async function bump(counter: Counter, now = Date.now()): Promise<void> {
  const key = statsKey(hourOf(now));
  await kv([
    ["HINCRBY", key, counter, 1],
    ["EXPIRE", key, STATS_TTL_SEC],
  ]);
}

/** One message seen in the group: the total, its topic, and who sent it. */
export async function countMessage(topic: number, userId: number, now = Date.now()): Promise<void> {
  const hour = hourOf(now);
  const key = statsKey(hour);
  const active = peopleKey("active", hour);
  await kv([
    ["HINCRBY", key, "msgs", 1],
    ["HINCRBY", key, `t${topic}`, 1],
    ["EXPIRE", key, STATS_TTL_SEC],
    ["SADD", active, userId],
    ["EXPIRE", active, STATS_TTL_SEC],
  ]);
}

/** People who joined or left. A set, so a join seen twice counts once. */
export async function countMembers(kind: "joins" | "leaves", userIds: number[], now = Date.now()): Promise<void> {
  if (userIds.length === 0) return;
  const key = peopleKey(kind, hourOf(now));
  await kv([
    ["SADD", key, ...userIds],
    ["EXPIRE", key, STATS_TTL_SEC],
  ]);
}

/** A question the helper handed to an admin, with a link so the owner can follow up. */
export type Escalation = { at: number; name: string; topic: string; text: string; link: string | null };

export async function logEscalation(e: Escalation): Promise<void> {
  const key = statsKey(hourOf(e.at));
  await kv([
    ["LPUSH", ESCALATIONS, JSON.stringify(e)],
    ["LTRIM", ESCALATIONS, 0, ESCALATIONS_MAX - 1],
    ["EXPIRE", ESCALATIONS, STATS_TTL_SEC],
    ["HINCRBY", key, "escalations", 1],
    ["EXPIRE", key, STATS_TTL_SEC],
  ]);
}

/** Keeps a question's text (already checked for secrets) for the report's summary. */
export async function logQuestion(text: string, now = Date.now()): Promise<void> {
  const key = questionsKey(watDay(now));
  await kv([
    ["LPUSH", key, JSON.stringify({ t: text.slice(0, 200), at: now })],
    ["LTRIM", key, 0, QUESTIONS_PER_DAY - 1],
    ["EXPIRE", key, QUESTIONS_TTL_SEC],
  ]);
}

export type Last24h = {
  /** Counter totals, plus "msgs" and "t<topic>" per topic. */
  counts: Record<string, number>;
  active: number;
  joins: number;
  leaves: number;
  escalations: Escalation[];
  questions: string[];
};

/** Everything counted in the last 24 hours, in one round trip. */
export async function readLast24h(now = Date.now()): Promise<Last24h> {
  const since = now - 24 * HOUR_MS;
  const hours = Array.from({ length: 24 }, (_, i) => hourOf(now) - i);
  const cmds: (string | number)[][] = hours.flatMap((h) => [
    ["HGETALL", statsKey(h)],
    ["SMEMBERS", peopleKey("active", h)],
    ["SMEMBERS", peopleKey("joins", h)],
    ["SMEMBERS", peopleKey("leaves", h)],
  ]);
  cmds.push(["LRANGE", ESCALATIONS, 0, -1], ["LRANGE", questionsKey(watDay(now)), 0, -1], ["LRANGE", questionsKey(watDay(now) - 1), 0, -1]);
  const res = await kv(cmds);

  const counts: Record<string, number> = {};
  const people = { active: new Set<string>(), joins: new Set<string>(), leaves: new Set<string>() };
  hours.forEach((_, i) => {
    for (const [k, v] of Object.entries(hashNumbers(res[i * 4]))) counts[k] = (counts[k] ?? 0) + v;
    (["active", "joins", "leaves"] as const).forEach((kind, j) => {
      const members = res[i * 4 + 1 + j];
      if (Array.isArray(members)) for (const m of members) people[kind].add(String(m));
    });
  });
  const tail = res.slice(hours.length * 4);
  const escalations = (Array.isArray(tail[0]) ? tail[0] : [])
    .map((r) => jsonOf<Escalation>(r))
    .filter((e): e is Escalation => Boolean(e && e.at > since));
  const questions = [...(Array.isArray(tail[1]) ? tail[1] : []), ...(Array.isArray(tail[2]) ? tail[2] : [])]
    .map((r) => jsonOf<{ t: string; at: number }>(r))
    .filter((q): q is { t: string; at: number } => Boolean(q && q.t && q.at > since))
    .map((q) => q.t);
  return { counts, active: people.active.size, joins: people.joins.size, leaves: people.leaves.size, escalations, questions };
}

/** Remembers the owner's private chat (its id is theirs) for scheduled reports. */
export async function rememberOwnerChat(chatId: number, username: string | undefined): Promise<void> {
  await kv([["HSET", OWNER_CHATS, String(chatId), (username ?? "").toLowerCase()]]);
}

/** Private chats owners have opened with the bot, with the handle each had then. */
export async function ownerChats(): Promise<{ chatId: number; username: string }[]> {
  const [raw] = await kv([["HGETALL", OWNER_CHATS]]);
  const out: { chatId: number; username: string }[] = [];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const chatId = Number(raw[i]);
    if (Number.isSafeInteger(chatId) && chatId > 0) out.push({ chatId, username: String(raw[i + 1] ?? "") });
  }
  return out;
}
