/**
 * The owner's report on the Gloam group: the last 24 hours of members,
 * activity, what the helper did, bug reports and what people asked about.
 * Server only. Times are WAT (Africa/Lagos, UTC+1).
 *
 * Everything but the summary comes from counters kept as messages arrive
 * (store.ts), so a busy day costs no model calls. The summary of questions is
 * the report's one model call, made only when a report is asked for.
 */
import { summarizeQuestions } from "./answer";
import { TOPIC, cleanName, topicName } from "./rules";
import { listBugReports, readLast24h, type BugReport, type Escalation } from "./store";
import { getChatMemberCount } from "./telegram";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ESCALATIONS = 10;
const MAX_BUGS = 5;
/** Telegram's message limit is 4096 characters. */
const MAX_REPORT = 4000;

export type ReportData = {
  now: number;
  persona: string;
  /** People in the group now, or null when Telegram did not say. */
  members: number | null;
  joins: number;
  leaves: number;
  messages: number;
  active: number;
  /** Messages per topic id. */
  topics: Record<number, number>;
  answered: number;
  welcomes: number;
  scams: number;
  scamsMissed: number;
  secrets: number;
  secretsMissed: number;
  escalations: Escalation[];
  /** Bug reports from the last 24 hours, newest first. */
  bugs: BugReport[];
  questions: number;
  /** The model's lines on what people asked, or null. */
  summary: string | null;
};

function parts(ms: number): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
}

/** "Thu 9 Oct, 21:00 WAT" */
export function watStamp(ms: number): string {
  const p = parts(ms);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} WAT`;
}

/** "21:00" */
function watTime(ms: number): string {
  const p = parts(ms);
  return `${p.hour}:${p.minute}`;
}

const num = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

function short(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

/** The report as plain text: short sections, each under a label on its own line. */
export function formatReport(d: ReportData): string {
  const lines: string[] = ["Gloam group report", `Last 24 hours, to ${watStamp(d.now)}`, ""];

  lines.push("Members");
  const count = d.members === null ? "Member count unavailable." : `${num(d.members)} in the group.`;
  lines.push(`${count} ${num(d.joins)} joined, ${num(d.leaves)} left.`, "");

  lines.push("Activity");
  if (d.messages === 0) {
    lines.push("No messages yet.");
  } else {
    lines.push(`${plural(d.messages, "message")} from ${plural(d.active, "person", "people")}.`);
    const busiest = Object.entries(d.topics)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
    if (busiest) lines.push(`Busiest topic: ${topicName(Number(busiest[0]))} (${plural(busiest[1], "message")}).`);
  }
  lines.push("");

  lines.push(d.persona);
  lines.push(`${plural(d.answered, "question")} answered, ${plural(d.welcomes, "welcome")} sent.`);
  lines.push(`${plural(d.scams, "scam message")} deleted, ${plural(d.secrets, "leaked secret")} deleted.`);
  const missed = d.scamsMissed + d.secretsMissed;
  if (missed > 0) lines.push(`${plural(missed, "more message")} flagged but not deleted. Check the bot can delete messages.`);
  if (d.escalations.length === 0) {
    lines.push("Nothing handed to an admin.");
  } else {
    lines.push(`Handed to an admin: ${num(d.escalations.length)}`);
    for (const e of d.escalations.slice(0, MAX_ESCALATIONS)) {
      lines.push(`- ${watTime(e.at)} ${cleanName(e.name)} in ${e.topic}: ${short(e.text)}${e.link ? ` ${e.link}` : ""}`);
    }
    if (d.escalations.length > MAX_ESCALATIONS) lines.push(`- and ${num(d.escalations.length - MAX_ESCALATIONS)} more`);
  }
  lines.push("");

  lines.push("Bug reports");
  if (d.bugs.length === 0) {
    lines.push("No bug reports.");
  } else {
    lines.push(`${plural(d.bugs.length, "new report")}.`);
    for (const b of d.bugs.slice(0, MAX_BUGS)) {
      lines.push(`- ${cleanName(b.firstName || b.username || "", "Someone")}: ${short(b.text)}${b.link ? ` ${b.link}` : ""}`);
    }
  }
  lines.push("");

  lines.push("What people asked about");
  if (d.questions === 0) lines.push("No questions yet.");
  else lines.push(d.summary ?? `${plural(d.questions, "question")} seen. The summary is unavailable right now.`);

  const text = lines.join("\n").trim();
  return text.length > MAX_REPORT ? `${text.slice(0, MAX_REPORT - 3).trimEnd()}...` : text;
}

/** Reads the counters, the member count and the bug list, and writes the summary. */
export async function gatherReport(groupId: number, persona: string, now = Date.now()): Promise<ReportData> {
  const [stats, members, bugs] = await Promise.all([
    readLast24h(now).catch(() => null),
    getChatMemberCount(groupId),
    listBugReports(50).catch(() => [] as BugReport[]),
  ]);
  const counts = stats?.counts ?? {};
  const topics: Record<number, number> = {};
  for (const id of Object.values(TOPIC)) topics[id] = counts[`t${id}`] ?? 0;
  const questions = stats?.questions ?? [];
  return {
    now,
    persona,
    members,
    joins: stats?.joins ?? 0,
    leaves: stats?.leaves ?? 0,
    messages: counts.msgs ?? 0,
    active: stats?.active ?? 0,
    topics,
    answered: counts.answered ?? 0,
    welcomes: counts.welcomes ?? 0,
    scams: counts.scams ?? 0,
    scamsMissed: counts.scamsMissed ?? 0,
    secrets: counts.secrets ?? 0,
    secretsMissed: counts.secretsMissed ?? 0,
    escalations: stats?.escalations ?? [],
    bugs: bugs.filter((b) => b.createdAt > now - DAY_MS),
    questions: questions.length,
    summary: await summarizeQuestions(questions),
  };
}

export async function buildReport(groupId: number, persona: string, now = Date.now()): Promise<string> {
  return formatReport(await gatherReport(groupId, persona, now));
}
