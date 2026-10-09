/**
 * The few Telegram Bot API shapes and calls the community helper uses.
 * Server only. Plain fetch, no SDK. Every call is best effort: a failure is
 * returned, never thrown, so one bad call cannot break the webhook.
 */

export type TgUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TgChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
  title?: string;
  is_forum?: boolean;
};

export type TgEntity = {
  type: string;
  offset: number;
  length: number;
  user?: TgUser;
};

export type TgMessage = {
  message_id: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  from?: TgUser;
  sender_chat?: TgChat;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  reply_to_message?: TgMessage;
  forum_topic_created?: unknown;
  new_chat_members?: TgUser[];
  via_bot?: TgUser;
};

export type TgChatMember = {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TgUser;
  is_member?: boolean;
};

export type TgChatMemberUpdated = {
  chat: TgChat;
  from: TgUser;
  date: number;
  old_chat_member: TgChatMember;
  new_chat_member: TgChatMember;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  chat_member?: TgChatMemberUpdated;
};

export type SendOptions = {
  /** Topic to post in. Leave out for General and private chats. */
  threadId?: number;
  /** Message to answer. Sent as a reply when it still exists. */
  replyTo?: number;
  /** "HTML" for the welcome; everything else is plain text. */
  parseMode?: "HTML";
};

const API = "https://api.telegram.org";

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T }> {
  const t = token();
  if (!t) return { ok: false };
  try {
    const res = await fetch(`${API}/bot${t}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
    return { ok: Boolean(res.ok && json?.ok), result: json?.result };
  } catch {
    return { ok: false };
  }
}

/** Sends a message with link previews off. Returns the new message id, or null. */
export async function sendMessage(chatId: number, text: string, opts: SendOptions = {}): Promise<number | null> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  };
  if (opts.threadId) body.message_thread_id = opts.threadId;
  if (opts.replyTo) body.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  const r = await call<{ message_id: number }>("sendMessage", body);
  return r.ok && r.result ? r.result.message_id : null;
}

/** Deletes a message. Works only while the bot is an admin with Delete messages. */
export async function deleteMessage(chatId: number, messageId: number): Promise<boolean> {
  return (await call("deleteMessage", { chat_id: chatId, message_id: messageId })).ok;
}

/** The bot's own account, read once per server instance. */
export async function getMe(): Promise<TgUser | null> {
  const g = globalThis as { __gloamTgMe?: TgUser };
  if (g.__gloamTgMe) return g.__gloamTgMe;
  const r = await call<TgUser>("getMe", {});
  if (r.ok && r.result?.id) g.__gloamTgMe = r.result;
  return g.__gloamTgMe ?? null;
}
