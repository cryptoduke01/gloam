import { NextResponse } from "next/server";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { KvUnavailableError } from "@/lib/partnersKv";
import { submitFeedback } from "@/lib/vote/feedback";
import { VoteError } from "@/lib/vote/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8_000;
const PER_MINUTE = 5;
const PER_HOUR = 20;

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** A holder's private note to the team: { author, category, message, timestamp, signature }. Never published. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const minute = await hitRateLimit(ip, "vote-feedback", PER_MINUTE);
  if (!minute.allowed) return fail(429, "rate_limited", "Too many notes at once. Wait a minute.", { "Retry-After": String(minute.retryAfterSec) });
  const hour = await hitRateLimit(ip, "vote-feedback-hour", PER_HOUR, Date.now(), 3600);
  if (!hour.allowed) return fail(429, "rate_limited", "Too many notes from this connection. Try again later.", { "Retry-After": String(hour.retryAfterSec) });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, "too_large", "That note is too long.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_body", "Something went wrong sending your note. Try again.");
  }
  try {
    const entry = await submitFeedback(body);
    return NextResponse.json({ ok: true, data: { id: entry.id } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof VoteError) return fail(e.status, e.code, e.message);
    if (e instanceof KvUnavailableError) return fail(503, "storage", "Notes can't be saved for a moment. Try again shortly.");
    return fail(500, "error", "We couldn't save your note. Try again.");
  }
}
