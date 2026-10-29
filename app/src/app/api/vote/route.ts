import { NextResponse } from "next/server";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { KvUnavailableError } from "@/lib/partnersKv";
import { excludedForVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voteSummary } from "@/lib/vote/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READS_PER_MINUTE = 120;

/** Every vote the site shows, with live totals: what /vote polls. */
export async function GET(req: Request) {
  const rate = await hitRateLimit(clientIp(req), "vote-read", READS_PER_MINUTE);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "rate_limited", message: "Too many requests. Wait a minute." } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec), "Cache-Control": "no-store" } },
    );
  }
  try {
    const votes = await Promise.all(visibleVotes().map((v) => voteSummary(v, snapshotFor(v), excludedForVote(v))));
    return NextResponse.json({ ok: true, data: { votes } }, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } });
  } catch (e) {
    const storage = e instanceof KvUnavailableError;
    return NextResponse.json(
      { ok: false, error: { code: storage ? "storage" : "error", message: "Results are not available for a moment. Try again shortly." } },
      { status: storage ? 503 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
