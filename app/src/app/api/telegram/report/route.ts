import { NextResponse } from "next/server";
import { botConfig, isOwner } from "@/lib/telegramBot/bot";
import { buildReport } from "@/lib/telegramBot/report";
import { webhookSecretOk } from "@/lib/telegramBot/rules";
import { ownerChats } from "@/lib/telegramBot/store";
import { sendMessage } from "@/lib/telegramBot/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily report for the owner, run by the Vercel cron in vercel.json at 20:00
 * UTC (21:00 WAT). Vercel sends `Authorization: Bearer <CRON_SECRET>`; without
 * CRON_SECRET set nothing gets in. Does nothing unless TELEGRAM_DAILY_REPORT
 * is true, and only writes to private chats an owner opened with the bot.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !webhookSecretOk(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const c = botConfig();
  if (!c.dailyReport) return NextResponse.json({ ok: true, data: { sent: 0, skipped: "TELEGRAM_DAILY_REPORT is off" } });

  // a stored chat counts only while its person is still an owner (a private chat's id is the user's id)
  const chats = (await ownerChats().catch(() => [])).filter((o) => isOwner({ id: o.chatId, username: o.username || undefined }, c));
  if (chats.length === 0) {
    return NextResponse.json({ ok: true, data: { sent: 0, skipped: "No owner has messaged the bot yet" } });
  }
  const text = await buildReport(c.groupId, c.persona);
  let sent = 0;
  for (const o of chats) if (await sendMessage(o.chatId, text)) sent++;
  return NextResponse.json({ ok: true, data: { sent } });
}
