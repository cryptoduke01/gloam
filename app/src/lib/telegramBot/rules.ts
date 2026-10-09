/**
 * The community helper's rules, as plain functions with no network calls:
 * when it speaks, what counts as a scam or a leaked secret, what a reply may
 * contain, and the welcome text. Kept pure so scripts/selftest-telegram.mts
 * can check every rule, including the false positives.
 */
import { createHash, timingSafeEqual } from "crypto";
import { english } from "viem/accounts";
import type { TgMessage, TgUser } from "./telegram";

/** Forum topics in t.me/gloamhq, by message_thread_id. General messages carry no thread id. */
export const TOPIC = { general: 1, testers: 2, announcements: 3, help: 4, feedback: 5 } as const;

const TOPIC_NAME: Record<number, string> = {
  [TOPIC.general]: "General",
  [TOPIC.testers]: "Testers",
  [TOPIC.announcements]: "Announcements",
  [TOPIC.help]: "Help",
  [TOPIC.feedback]: "Feedback",
};

export function topicName(topic: number): string {
  return TOPIC_NAME[topic] ?? "General";
}

// ---------------------------------------------------------------- webhook

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Telegram's X-Telegram-Bot-Api-Secret-Token against ours, in constant time. No secret set means no access. */
export function webhookSecretOk(got: string | null | undefined, expected: string | null | undefined): boolean {
  const want = expected?.trim();
  if (!want || !got) return false;
  return timingSafeEqual(sha256(got), sha256(want));
}

// ---------------------------------------------------------------- messages

/** Curly quotes to straight ones, so patterns see one kind of apostrophe. */
function norm(text: string): string {
  return text.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"');
}

/** The message's words: text, or a photo's caption. */
export function messageText(msg: TgMessage): string {
  return (msg.text ?? msg.caption ?? "").trim();
}

/** Which topic a group message is in. Replies inside General carry a thread id but are not topic messages. */
export function topicOf(msg: TgMessage): number {
  return msg.is_topic_message && msg.message_thread_id ? msg.message_thread_id : TOPIC.general;
}

/**
 * The message this one deliberately replies to, or null. In a forum topic every
 * message points at the topic's first message; that is not a reply.
 */
export function explicitReply(msg: TgMessage): TgMessage | null {
  const r = msg.reply_to_message;
  if (!r || r.forum_topic_created) return null;
  if (msg.is_topic_message && r.message_id === msg.message_thread_id) return null;
  return r;
}

function entitiesOf(msg: TgMessage) {
  return msg.entities ?? msg.caption_entities ?? [];
}

/** The bot is tagged by @username or by a mention of its account. */
export function mentionsBot(msg: TgMessage, me: Pick<TgUser, "id" | "username">): boolean {
  const text = messageText(msg);
  const handle = me.username ? `@${me.username}`.toLowerCase() : null;
  for (const e of entitiesOf(msg)) {
    if (e.type === "text_mention" && e.user?.id === me.id) return true;
    if (e.type === "mention" && handle && text.slice(e.offset, e.offset + e.length).toLowerCase() === handle) return true;
  }
  return handle ? new RegExp(`(^|[^\\w])${escapeRe(handle)}(?![\\w])`, "i").test(text) : false;
}

/** The message tags someone other than the bot, so it is meant for them. */
export function mentionsOthers(msg: TgMessage, me: Pick<TgUser, "id" | "username">): boolean {
  const text = messageText(msg);
  const handle = me.username ? `@${me.username}`.toLowerCase() : null;
  return entitiesOf(msg).some(
    (e) =>
      (e.type === "text_mention" && e.user?.id !== me.id) ||
      (e.type === "mention" && text.slice(e.offset, e.offset + e.length).toLowerCase() !== handle),
  );
}

/** The persona's name used as a word ("hey Glim", "thanks glim!"). */
export function namesPersona(text: string, name: string): boolean {
  if (!name) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(name)}($|[^\\p{L}\\p{N}_])`, "iu").test(text);
}

export type Command = { name: string; args: string; forOther: boolean };

/** A slash command. `forOther` when it names a different bot (/help@otherbot). */
export function parseCommand(text: string, botUsername?: string): Command | null {
  const m = /^\/([a-z0-9_]{1,32})(?:@([a-z0-9_]{3,64}))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const target = m[2]?.toLowerCase();
  return {
    name: m[1]!.toLowerCase(),
    args: (m[3] ?? "").trim(),
    forOther: Boolean(target && target !== botUsername?.toLowerCase()),
  };
}

/** The owner asking for the report in plain words: "report", "daily report", "stats", "how was today". */
export function wantsReport(text: string): boolean {
  return /\b(?:report|stats|statistics|summary)\b|\bhow\s+(?:was|is|did)\s+(?:today|the\s+day|the\s+group|it\s+go)\b/i.test(norm(text));
}

/** A reply that hands the person to an admin ("an admin will follow up"). */
export function handsToAdmin(text: string): boolean {
  return (
    /\badmins?\s+will\s+(?:follow\s+up|take\s+a\s+look|look\s+into|get\s+back|check)\b/i.test(text) ||
    /\b(?:i'll|i\s+will|let\s+me)\s+(?:talk\s+to|ping|tell|take\s+(?:this|it)\s+to|flag\s+(?:this|it)\s+(?:to|for)|run\s+(?:this|it)\s+by)\s+(?:boss\s+duke|duke|the\s+team|an?\s+admin|the\s+admins)\b/i.test(text)
  );
}

// ---------------------------------------------------------------- triggers

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const GREETING = /^(?:(?:hi|hey|hello|yo|gm|hiya|guys|all|everyone|team|folks|pls|please)\b[\s,!.:-]*)+/i;
const QUESTION_START =
  /^(?:how|what|why|where|when|can|does|is|my|i can't|i cant|i cannot|i can not|not working|error)(?![\p{L}\p{N}_])/iu;

/**
 * Reads like a question, for the topics where the helper answers unprompted
 * (Help, Testers). Conservative: a "?" or one of a few opening words.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = norm(text)
    .replace(URL_RE, " ")
    .replace(/^(?:@\w+[\s,:]*)+/, "")
    .trim()
    .replace(GREETING, "")
    .trim();
  if (t.length < 8 || t.split(/\s+/).length < 2) return false;
  if (t.includes("?")) return true;
  return QUESTION_START.test(t);
}

const BUG_WORDS =
  /\b(?:bugs?|buggy|broken|crash(?:ed|es|ing)?|glitch(?:y|es)?|not working|isn't working|doesn't work|does not work|didn't work|won't (?:load|open|work|connect|send|go through)|stuck|fail(?:s|ed|ing|ure)?|errors?)\b/i;
const NOT_A_BUG = /\b(?:no|zero|without|any|found no)\s+(?:bugs?|issues?|errors?)\b|\bbug[- ]free\b/i;

/** Reads like a bug report, for Testers and Feedback. Needs a few words and a problem word. */
export function looksLikeBugReport(text: string): boolean {
  const t = norm(text);
  if (t.split(/\s+/).filter(Boolean).length < 4) return false;
  return BUG_WORDS.test(t) && !NOT_A_BUG.test(t);
}

// ---------------------------------------------------------------- scams and secrets

const NEGATION = /\b(?:never|not|no one|nobody|don't|do not|won't|will not|shouldn't|should not|can't|cannot)\b|n't\b/i;

/**
 * Whether a match is negated in its own clause: "never share your seed phrase"
 * is advice, "don't worry, just send your seed phrase" is not.
 */
function negated(text: string, index: number, match: string): boolean {
  const before = text.slice(Math.max(0, index - 40), index);
  const clause = before.slice(before.search(/[^,.;!?\n]*$/));
  return NEGATION.test(`${clause} ${match}`);
}

const SECRET_NOUN = String.raw`(?:(?:seed|recovery|secret|mnemonic|backup)\s*(?:phrase|words?)|private\s*keys?|12[- ]words?|24[- ]words?)`;
const SECRET_REQUEST = new RegExp(
  String.raw`\b(?:send|share|give|provide|submit|drop|paste|dm)\s+(?:it\s+|me\s+|us\s+)?(?:your|ur)\s+(?:wallet'?s?\s+)?` + SECRET_NOUN,
  "i",
);
const SECRET_QUESTION = new RegExp(String.raw`\bwhat(?:'s| is)\s+(?:your|ur)\s+(?:wallet'?s?\s+)?` + SECRET_NOUN, "i");
const OFFER_DM =
  /\b(?:dm|pm|inbox|message|text|contact|write to)\s+(?:me|us|@\w{3,})\b[^.!?\n]{0,40}?\b(?:for|to get|to receive)\s+(?:quick |instant |fast |direct )?(?:support|help|assistance|a fix|fixing|recovery|refunds?|your (?:issue|problem|funds|wallet))\b/i;
const SUPPORT_AT =
  /\b(?:support|help ?desk|customer (?:care|service)|tech(?:nical)? (?:team|support)|admins?|moderators?)\b[^.!?\n]{0,30}?\b(?:on|via|at|in|through)\s+(?:dm|pm|inbox|@\w{3,}|t\.me\/\w+)/i;
const ASKING = /\b(?:can|could|would|will|pls|plz|please)\s+(?:someone|anyone|somebody|an? (?:admin|mod|moderator)|the team|you)\b/i;
const WALLET_FIX =
  /\b(?:validate|validation|rectify|rectification|reactivate|synchroni[sz]e|resync|whitelist)\s+(?:your\s+|ur\s+|the\s+)?wallets?\b|\bsync\s+(?:your|ur)\s+wallets?\b|\bwallet\s+(?:validation|rectification|synchroni[sz]ation)\b/i;
const LINK_RE =
  /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|t\.me\/[^\s<>"']+|(?:[a-z0-9-]+\.)+(?:com|io|xyz|org|net|app|finance|link|site|online|live|pro|top|info|co|me|cc|vip|club|fi|dev|gg|ai|so|claims?|gift|cash|money|exchange|network|tech|trade)(?:\/[^\s<>"']*)?)/gi;
const LURE =
  /\b(?:wallets?|claim(?:ing|ed)?|airdrops?|giveaways?|rewards?|bonus|free (?:tokens?|money|usdc|usdt|eth|crypto)|connect|whitelist|presale|mint|eligible|allocation)\b/i;
/** Hosts people post here for good reasons (faucets, explorers, wallets). Not flagged as phishing. */
const SAFE_HOSTS = [
  "gloam.trade",
  "x.com",
  "twitter.com",
  "robinhood.com",
  "tempo.xyz",
  "paxos.com",
  "github.com",
  "metamask.io",
  "rabby.io",
  "imgur.com",
  "prnt.sc",
  "loom.com",
  "youtube.com",
  "youtu.be",
];

function hostOf(link: string): { host: string; path: string } {
  const bare = link.replace(/^https?:\/\//i, "").replace(/[).,!?;:'"]+$/, "");
  const slash = bare.indexOf("/");
  const host = (slash < 0 ? bare : bare.slice(0, slash)).toLowerCase().replace(/^www\./, "");
  const path = slash < 0 ? "" : bare.slice(slash);
  return { host, path };
}

function onHost(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

function isGroupLink(host: string, path: string): boolean {
  return host === "t.me" && /^\/gloamhq(?:[/?#]|$)/i.test(path);
}

/** Someone asking for help ("can someone DM me for help?") rather than offering it. */
function askingForHelp(text: string, m: RegExpExecArray): boolean {
  const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length);
  const end = text.slice(m.index).search(/[.!?\n]/);
  return ASKING.test(around) || (end >= 0 && text[m.index + end] === "?");
}

export type ScamReason = "secret_request" | "dm_support" | "wallet_fix" | "phishing_link";

/**
 * Obvious scam patterns, conservative on purpose: asking for a seed phrase or
 * private key, offering support in DMs, "validate/sync/rectify your wallet",
 * or a link to a strange site next to wallet, claim or airdrop wording. Safety
 * advice ("never share your seed phrase") and people asking for help are not
 * flagged.
 */
export function scamReason(raw: string): ScamReason | null {
  const text = norm(raw);
  for (const re of [SECRET_REQUEST, SECRET_QUESTION]) {
    const m = re.exec(text);
    if (m && !negated(text, m.index, m[0])) return "secret_request";
  }
  for (const re of [OFFER_DM, SUPPORT_AT]) {
    const m = re.exec(text);
    if (m && !negated(text, m.index, m[0]) && !askingForHelp(text, m) && !/\b(?:gloamhq|gloamtrade)\b/i.test(m[0])) {
      return "dm_support";
    }
  }
  const fix = WALLET_FIX.exec(text);
  if (fix && !negated(text, fix.index, fix[0])) return "wallet_fix";
  if (LURE.test(text)) {
    for (const link of text.match(LINK_RE) ?? []) {
      const { host, path } = hostOf(link);
      if (host === "t.me" ? !isGroupLink(host, path) : !SAFE_HOSTS.some((s) => onHost(host, s))) return "phishing_link";
    }
  }
  return null;
}

const BIP39 = new Set(english);
const HEX64 = /(?<![0-9a-zA-Z/=])(0x)?[0-9a-fA-F]{64}(?![0-9a-zA-Z])/g;
const KEY_HINT = /\b(?:private\s*key|priv\s*key|secret\s*key|pk|seed|mnemonic|note secret)\b/i;
const HASH_HINT = /\b(?:tx|txn|txid|transaction|hash|commitment|nullifier|root|block|explorer)\b/i;

/** Twelve or more BIP-39 words in a row, the shape of a seed phrase. */
export function hasSeedPhrase(text: string): boolean {
  let run = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (!w) continue;
    run = BIP39.has(w) ? run + 1 : 0;
    if (run >= 12) return true;
  }
  return false;
}

/**
 * 64 hex characters that read as a private key. A 0x value is a transaction
 * hash unless the message talks about keys; a bare one is a key unless it
 * talks about transactions. Links (/tx/0x...) are never keys.
 */
export function hasPrivateKey(text: string): boolean {
  for (const m of text.matchAll(HEX64)) {
    if (m[1] ? KEY_HINT.test(text) : !HASH_HINT.test(text)) return true;
  }
  return false;
}

export type Leak = "seed_phrase" | "private_key";

/** Someone pasted a seed phrase or a private key. */
export function secretLeak(text: string): Leak | null {
  if (hasSeedPhrase(text)) return "seed_phrase";
  if (hasPrivateKey(text)) return "private_key";
  return null;
}

// ---------------------------------------------------------------- replies

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HANDLE_RE = /(?<![\w@.])@([A-Za-z0-9_]{3,32})\b/g;
const MAINNET_LIVE =
  /\bmainnet\s+(?:is\s+|has\s+)?(?:now\s+|already\s+)?(?:live|launched|out|open)\b|\b(?:live|launched|available|running)\s+on\s+mainnet\b/gi;
const DATE_WORD = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|march|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|q[1-4]|20\d\d|next (?:week|month|year))`;
const MAINNET_DATE = new RegExp(
  String.raw`\bmainnet\b[^.!?\n]{0,60}\b${DATE_WORD}\b|\b${DATE_WORD}\b[^.!?\n]{0,60}\bmainnet\b`,
  "i",
);
const HUMAN_CLAIM =
  /\bi(?:'m| am)\s+(?:a\s+)?(?:real\s+)?(?:human|person|duke|an?\s+admin|a\s+mod(?:erator)?|a\s+team\s+member|(?:on|part\s+of)\s+the\s+(?:gloam\s+)?team)\b|\bi(?:'m| am)\s+not\s+a\s+bot\b/i;
const AS_AN_AI = /[^.!?\n]*\bas an ai\b[^.!?\n]*[.!?]?\s*/gi;
const MAX_REPLY = 900;

export type ReplyPolicy = {
  /** Handles the reply may name, without "@": admins, the asker, the bot. */
  handles: string[];
};

/** A link the helper may share: the website, the group, the X account. */
function linkAllowed(link: string): boolean {
  const { host, path } = hostOf(link);
  if (host === "gloam.trade") return true;
  if (host === "x.com" || host === "twitter.com") return /^\/gloamtrade(?:[/?#]|$)/i.test(path);
  return isGroupLink(host, path);
}

/** Cuts at the last full sentence that fits. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n"));
  return (end > max / 3 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "")).trim();
}

/** Strips formatting the group should not see: headings, bold, emoji, em dashes, "As an AI". */
export function tidyReply(raw: string): string {
  return norm(raw)
    .replace(AS_AN_AI, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*[*\u2022]\s+/gm, "- ")
    .replace(/\s*[\u2014\u2015]\s*/g, ", ")
    .replace(/\u2013/g, "-")
    .replace(EMOJI, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The model's reply, made safe to post, or null when it breaks a rule that
 * tidying cannot fix: a link, email or handle that is not official, anything
 * shaped like a seed phrase or key, a claim that mainnet is live or a date for
 * it, or claiming to be a person.
 */
export function cleanReply(raw: string, policy: ReplyPolicy): string | null {
  const text = clip(tidyReply(raw), MAX_REPLY);
  if (!text) return null;
  if ((text.match(LINK_RE) ?? []).some((l) => !linkAllowed(l))) return null;
  if ((text.match(EMAIL_RE) ?? []).some((e) => e.toLowerCase() !== "hello@gloam.trade")) return null;
  const okHandles = new Set(["gloamtrade", "gloamhq", ...policy.handles.map((h) => h.toLowerCase())]);
  for (const m of text.matchAll(HANDLE_RE)) if (!okHandles.has(m[1]!.toLowerCase())) return null;
  if (secretLeak(text)) return null;
  for (const m of text.matchAll(MAINNET_LIVE)) if (!negated(text, m.index ?? 0, m[0])) return null;
  if (MAINNET_DATE.test(text)) return null;
  if (HUMAN_CLAIM.test(text)) return null;
  return text;
}

// ---------------------------------------------------------------- names and welcomes

const NAME_LURE = /\b(?:admin|support|airdrop|giveaway|claim|official|helpdesk|moderator)\b/i;

/** A display name safe to repeat: no links, handles or control characters, and never "Support" or "Admin". */
export function cleanName(raw: string | undefined, fallback = "friend"): string {
  const name = norm(raw ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(LINK_RE, "")
    .replace(/@\w+/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32)
    .trim();
  return name && !NAME_LURE.test(name) ? name : fallback;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type Joiner = { id: number; first: string; username?: string };

/** How many new members a welcome tags by name. */
export const WELCOME_TAGS = 10;

/**
 * One welcome for a batch of new members, as Telegram HTML. People with a
 * username are tagged as @username; the rest get a mention link to their
 * account, so the tag works without a username.
 */
export function welcomeHtml(joiners: Joiner[], testingOpen: boolean): string {
  const tags = joiners.slice(0, WELCOME_TAGS).map((j) =>
    j.username && /^[A-Za-z0-9_]{5,32}$/.test(j.username)
      ? `@${j.username}`
      : `<a href="tg://user?id=${Math.trunc(j.id)}">${escapeHtml(cleanName(j.first))}</a>`,
  );
  const others = joiners.length - tags.length;
  if (others > 0) tags.push(`${others} ${others === 1 ? "other" : "others"}`);
  const list = tags.length > 1 ? `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}` : (tags[0] ?? "friends");
  const testing = testingOpen
    ? "Testers, your guide is pinned in the Testers topic."
    : "Testing directions land in the Testers topic soon.";
  return (
    `Welcome to Gloam, ${list}. Glad you're here. Ask anything in Help, share ideas in Feedback, ` +
    `and keep an eye on Announcements. ${testing} Everything else lives at gloam.trade, ` +
    `or write to hello@gloam.trade. Admins never DM first.`
  );
}

// ---------------------------------------------------------------- memory

/** One line of a thread's recent history, as kept in the store. */
export type ChatLine = { n: string; t: string; b?: 1 };

/** Text fit to keep in thread memory, or null for anything that looks like a secret or a scam. */
export function memoryText(text: string): string | null {
  if (secretLeak(text) || scamReason(text)) return null;
  const t = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 400) : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
