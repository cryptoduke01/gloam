/**
 * Glim, the Gloam community helper on Telegram: what it does with each update
 * the webhook (app/api/telegram) hands it. Server only.
 *
 * It only ever writes to the Gloam group (TELEGRAM_GROUP_ID) or to a private
 * chat someone opened with it; it never starts a DM. Every other chat is
 * ignored. In the group:
 *  - a seed phrase or private key gets deleted (when the bot is admin) and a
 *    warning to move funds now; an obvious scam gets deleted and a short "admins
 *    never DM first" note
 *  - it answers when tagged or replied to in any topic but Announcements, and
 *    unprompted only to questions in Help and Testers and to bug reports in
 *    Testers and Feedback, which it also saves for the admin dashboard
 *  - new members get one batched welcome at most every ten minutes
 *  - /help and /start give a short guide, /bug saves a report
 * Answers are rate limited per person and overall; past the limit it stays quiet.
 */
import { askModel, systemPrompt, userPrompt } from "./answer";
import { personaName } from "./persona";
import {
  TOPIC,
  cleanName,
  cleanReply,
  explicitReply,
  looksLikeBugReport,
  looksLikeQuestion,
  memoryText,
  mentionsBot,
  mentionsOthers,
  messageText,
  namesPersona,
  parseCommand,
  scamReason,
  secretLeak,
  topicName,
  topicOf,
  welcomeHtml,
  type Command,
  type Joiner,
} from "./rules";
import { markSeen, queueJoiners, remember, saveBugReport, takeWelcomeBatch, threadThenRemember } from "./store";
import { deleteMessage, getMe, sendMessage, type TgChatMemberUpdated, type TgMessage, type TgUpdate, type TgUser } from "./telegram";
import { hitRateLimit } from "@/lib/mcpRemote/rateLimit";

/** t.me/gloamhq. TELEGRAM_GROUP_ID overrides it. */
const GLOAM_GROUP_ID = -1004464028206;
/** Answers per person per minute, and for everyone together. */
const USER_PER_MIN = 4;
const GLOBAL_PER_MIN = 40;
/** Scam warnings per topic per minute, so a raid does not turn into a wall of warnings. */
const WARN_PER_MIN = 2;
/** Bug reports saved per person per minute. */
const BUGS_PER_MIN = 6;
/** Private chats keep their history under topic 0. */
const DM_TOPIC = 0;

export type BotConfig = {
  groupId: number;
  persona: string;
  testingOpen: boolean;
  /** Admin handles, lower case, without "@". */
  admins: string[];
};

export function botConfig(): BotConfig {
  const group = Number(process.env.TELEGRAM_GROUP_ID?.trim());
  return {
    groupId: Number.isSafeInteger(group) && group !== 0 ? group : GLOAM_GROUP_ID,
    persona: personaName(),
    testingOpen: /^(1|true|yes|on)$/i.test(process.env.GLOAM_TESTING_OPEN?.trim() ?? ""),
    admins: (process.env.TELEGRAM_ADMIN_HANDLES ?? "")
      .split(",")
      .map((h) => h.trim().replace(/^@/, "").toLowerCase())
      .filter((h) => /^[a-z0-9_]{3,32}$/.test(h)),
  };
}

// ---------------------------------------------------------------- copy

function groupGuide(c: BotConfig): string {
  const testing = c.testingOpen
    ? "Testers, your guide is pinned in the Testers topic."
    : "Testing directions land in the Testers topic soon.";
  return (
    `Hi, I'm ${c.persona}, Gloam's community helper bot. Tag me or reply to me with a question, or just ask in Help. ` +
    `Ideas and bugs go in Feedback, or type /bug and what happened. ${testing} ` +
    `Docs live at gloam.trade/docs, news at @gloamtrade, and anything private goes to hello@gloam.trade. Admins never DM first.`
  );
}

function dmGuide(c: BotConfig, name: string): string {
  return (
    `Hi ${name}, I'm ${c.persona}, Gloam's community helper bot. I hang out in the Gloam group at t.me/gloamhq, ` +
    `so ask me there in the Help topic. Docs are at gloam.trade/docs, and anything private can go to hello@gloam.trade. ` +
    `Admins never DM first, and nobody from Gloam will ever ask for your seed phrase or private key.`
  );
}

function bugThanks(name: string): string {
  return `Thanks ${name}, I saved that for the team and an admin will take a look. If you have the steps, a screenshot or a transaction link, add them here.`;
}

function bugNotSaved(name: string): string {
  return `Thanks ${name}. I couldn't save that just now, so please post it in the Feedback topic or email hello@gloam.trade, and an admin will take a look.`;
}

function cantAnswer(c: BotConfig, name: string, topic: number | null): string {
  const cc = c.admins.length ? ` (${c.admins.map((h) => `@${h}`).join(" ")})` : "";
  if (topic === null) {
    return "I don't want to guess on that one. Ask in the Help topic at t.me/gloamhq or email hello@gloam.trade, and an admin will follow up.";
  }
  if (topic === TOPIC.help) return `I don't want to guess on that one, ${name}. An admin will follow up here${cc}.`;
  return `I don't want to guess on that one, ${name}. Ask in the Help topic or email hello@gloam.trade, and an admin will follow up${cc}.`;
}

function leakWarning(name: string, removed: boolean): string {
  const first = removed
    ? `${name}, I removed your message because it looked like a seed phrase or private key.`
    : `${name}, that looks like a seed phrase or private key. Please delete it now.`;
  return `${first} Treat that wallet as exposed: move your funds to a new wallet now, and never share it again. Nobody from Gloam will ever ask for it.`;
}

function scamWarning(removed: boolean): string {
  const first = removed ? "Heads up, I removed a message that looked like a scam." : "Heads up, that message looks like a scam.";
  return `${first} Gloam admins never DM first and will never ask for your seed phrase, private key or funds. If someone messages you offering help, it's not us.`;
}

// ---------------------------------------------------------------- helpers

/** Someone may get an answer now: under the per-person limit and the overall one. */
async function withinLimits(userId: number): Promise<boolean> {
  if (!(await hitRateLimit(`tg:${userId}`, "tg-user", USER_PER_MIN)).allowed) return false;
  return (await hitRateLimit("tg:all", "tg-global", GLOBAL_PER_MIN)).allowed;
}

function firstName(u: TgUser): string {
  return cleanName(u.first_name, u.username ? cleanName(u.username) : "friend");
}

/** A link to the message, for the bug list. */
function messageLink(msg: TgMessage): string | null {
  if (msg.chat.type === "private") return null;
  if (msg.chat.username) return `https://t.me/${msg.chat.username}/${msg.message_id}`;
  const internal = String(msg.chat.id).replace(/^-100/, "");
  return msg.chat.type === "supergroup" ? `https://t.me/c/${internal}/${msg.message_id}` : null;
}

async function saveBug(msg: TgMessage, from: TgUser, text: string, thread: string): Promise<boolean> {
  if (!(await hitRateLimit(`tg:${from.id}`, "tg-bug", BUGS_PER_MIN)).allowed) return false;
  try {
    await saveBugReport({
      userId: from.id,
      username: from.username ?? null,
      firstName: cleanName(from.first_name, ""),
      thread,
      text,
      link: messageLink(msg),
    });
    return true;
  } catch {
    return false;
  }
}

/** History, then this message added to it. A store outage just means no history. */
async function historyFor(chatId: number, topic: number, name: string, text: string) {
  const t = memoryText(text);
  return threadThenRemember(chatId, topic, t ? { n: name, t } : null).catch(() => []);
}

type Compose = {
  c: BotConfig;
  me: TgUser;
  from: TgUser;
  name: string;
  text: string;
  topic: number | null;
  replied: TgMessage | null;
  history: { n: string; t: string; b?: 1 }[];
  bug: boolean;
};

/** The model's answer after the reply rules, or null. */
async function compose(x: Compose): Promise<string | null> {
  const repliedText = x.replied ? messageText(x.replied) : "";
  const inHistory = x.history.some((l) => l.t === repliedText);
  const raw = await askModel(
    systemPrompt({ persona: x.c.persona, testingOpen: x.c.testingOpen, admins: x.c.admins }),
    userPrompt({
      persona: x.c.persona,
      asker: x.name,
      text: x.text,
      topic: x.topic === null ? null : topicName(x.topic),
      repliedTo:
        repliedText && !inHistory && memoryText(repliedText)
          ? { name: x.replied?.from?.id === x.me.id ? `${x.c.persona} (you)` : cleanName(x.replied?.from?.first_name), text: repliedText }
          : null,
      history: x.history,
      bug: x.bug,
    }),
  );
  if (!raw) return null;
  const handles = [...x.c.admins, x.from.username, x.me.username].filter((h): h is string => Boolean(h));
  return cleanReply(raw, { handles });
}

// ---------------------------------------------------------------- welcomes

function joinerOf(u: TgUser): Joiner {
  return { id: u.id, first: u.first_name, ...(u.username ? { username: u.username } : {}) };
}

/** Posts the batched welcome in General when one is due. */
async function flushWelcome(c: BotConfig): Promise<void> {
  const batch = await takeWelcomeBatch().catch(() => null);
  if (batch?.length) await sendMessage(c.groupId, welcomeHtml(batch, c.testingOpen), { parseMode: "HTML" });
}

async function welcome(users: TgUser[], c: BotConfig): Promise<void> {
  const people = users.filter((u) => !u.is_bot);
  if (people.length === 0) return;
  await queueJoiners(people.map(joinerOf)).catch(() => 0);
  await flushWelcome(c);
}

/** A chat_member update that means someone joined (or came back). */
function joined(u: TgChatMemberUpdated): boolean {
  const inside = (s: string, member?: boolean) =>
    s === "member" || s === "administrator" || s === "creator" || (s === "restricted" && member === true);
  return !inside(u.old_chat_member.status, u.old_chat_member.is_member) && inside(u.new_chat_member.status, u.new_chat_member.is_member);
}

// ---------------------------------------------------------------- group

async function onCommand(cmd: Command, msg: TgMessage, from: TgUser, c: BotConfig, topic: number | null): Promise<void> {
  const chatId = msg.chat.id;
  const threadId = msg.is_topic_message ? msg.message_thread_id : undefined;
  const name = firstName(from);
  if (cmd.name !== "help" && cmd.name !== "start" && cmd.name !== "bug") return;
  if (!(await withinLimits(from.id))) return;
  if (cmd.name === "bug") {
    if (cmd.args.length < 3) {
      await sendMessage(chatId, "Tell me what happened after /bug, like: /bug The faucet button keeps spinning on Tempo.", { threadId, replyTo: msg.message_id });
      return;
    }
    const saved = await saveBug(msg, from, cmd.args, topic === null ? "Direct message" : topicName(topic));
    const text = saved ? bugThanks(name) : bugNotSaved(name);
    await sendMessage(chatId, text, { threadId, replyTo: msg.message_id });
    return;
  }
  await sendMessage(chatId, topic === null ? dmGuide(c, name) : groupGuide(c), { threadId, replyTo: msg.message_id });
}

async function onGroupMessage(msg: TgMessage, c: BotConfig): Promise<void> {
  const from = msg.from;
  // other bots, channels, anonymous admins and service messages are not people asking
  if (!from || from.is_bot || msg.sender_chat || msg.via_bot) return;
  const text = messageText(msg);
  if (!text) return;
  const chatId = msg.chat.id;
  const topic = topicOf(msg);
  const threadId = msg.is_topic_message ? msg.message_thread_id : undefined;
  const name = firstName(from);
  const isAdmin = Boolean(from.username && c.admins.includes(from.username.toLowerCase()));

  if (secretLeak(text)) {
    const removed = await deleteMessage(chatId, msg.message_id);
    await sendMessage(chatId, leakWarning(name, removed), { threadId, replyTo: removed ? undefined : msg.message_id });
    return;
  }
  if (!isAdmin && scamReason(text)) {
    const removed = await deleteMessage(chatId, msg.message_id);
    if ((await hitRateLimit(`tg:${chatId}:${topic}`, "tg-warn", WARN_PER_MIN)).allowed) {
      await sendMessage(chatId, scamWarning(removed), { threadId, replyTo: removed ? undefined : msg.message_id });
    }
    return;
  }
  if (topic === TOPIC.announcements) return;

  const me = await getMe();
  if (!me) return;
  const cmd = parseCommand(text, me.username);
  if (cmd) {
    if (!cmd.forOther) await onCommand(cmd, msg, from, c, topic);
    return;
  }

  const history = await historyFor(chatId, topic, name, text);
  const replied = explicitReply(msg);
  const toBot = replied?.from?.id === me.id;
  // General needs a real tag or reply; elsewhere saying the persona's name counts too
  const tagged = mentionsBot(msg, me) || toBot || (topic !== TOPIC.general && namesPersona(text, c.persona));
  const bug = (topic === TOPIC.testers || topic === TOPIC.feedback) && looksLikeBugReport(text);
  const unprompted =
    (topic === TOPIC.help || topic === TOPIC.testers) &&
    looksLikeQuestion(text) &&
    !mentionsOthers(msg, me) &&
    !(replied && !toBot && replied.from?.id !== from.id);
  if (!tagged && !bug && !unprompted) return;

  const saved = bug ? await saveBug(msg, from, text, topicName(topic)) : false;
  if (!(await withinLimits(from.id))) return;

  const answer = await compose({ c, me, from, name, text, topic, replied, history, bug: saved });
  const reply = answer ?? (saved ? bugThanks(name) : tagged ? cantAnswer(c, name, topic) : null);
  if (!reply) return;
  const sent = await sendMessage(chatId, reply, { threadId, replyTo: msg.message_id });
  if (sent) await remember(chatId, topic, { n: c.persona, t: reply.slice(0, 400), b: 1 }).catch(() => {});
}

// ---------------------------------------------------------------- private chats

async function onPrivate(msg: TgMessage, c: BotConfig): Promise<void> {
  const from = msg.from;
  if (!from || from.is_bot) return;
  const text = messageText(msg);
  if (!text) return;
  const chatId = msg.chat.id;
  const name = firstName(from);

  if (secretLeak(text)) {
    const removed = await deleteMessage(chatId, msg.message_id);
    await sendMessage(chatId, leakWarning(name, removed));
    return;
  }
  const me = await getMe();
  if (!me) return;
  const cmd = parseCommand(text, me.username);
  if (cmd) {
    if (!cmd.forOther) await onCommand(cmd, msg, from, c, null);
    return;
  }
  const history = await historyFor(chatId, DM_TOPIC, name, text);
  if (!(await withinLimits(from.id))) return;
  const answer = await compose({ c, me, from, name, text, topic: null, replied: null, history, bug: false });
  const reply = answer ?? dmGuide(c, name);
  const sent = await sendMessage(chatId, reply, { replyTo: msg.message_id });
  if (sent && answer) await remember(chatId, DM_TOPIC, { n: c.persona, t: reply.slice(0, 400), b: 1 }).catch(() => {});
}

// ---------------------------------------------------------------- entry

/** Handles one authenticated update. Never throws for a bad update; network failures are swallowed. */
export async function handleUpdate(update: TgUpdate, c: BotConfig = botConfig()): Promise<void> {
  const seen = await markSeen(update.update_id).catch(() => ({ fresh: true, welcomePending: false }));
  if (!seen.fresh) return;

  if (update.chat_member) {
    const u = update.chat_member;
    if (u.chat.id === c.groupId && joined(u)) await welcome([u.new_chat_member.user], c);
    return;
  }

  const msg = update.message;
  if (!msg) return;
  if (msg.chat.type === "private") return onPrivate(msg, c);
  if (msg.chat.id !== c.groupId) return;
  if (msg.new_chat_members?.length) return welcome(msg.new_chat_members, c);
  if (seen.welcomePending) await flushWelcome(c);
  await onGroupMessage(msg, c);
}
