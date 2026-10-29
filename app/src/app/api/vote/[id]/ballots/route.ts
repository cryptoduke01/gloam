import { NextResponse } from "next/server";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { KvUnavailableError } from "@/lib/partnersKv";
import { excludedForVote, findVote, snapshotFor } from "@/lib/vote/registry";
import { ballotsCsv, ballotsExport } from "@/lib/vote/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READS_PER_MINUTE = 30;

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Every signed vote, for anyone to recount: JSON with the typed data, the
 * snapshot block and the excluded addresses, or `?format=csv`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rate = await hitRateLimit(clientIp(req), "vote-ballots", READS_PER_MINUTE);
  if (!rate.allowed) return fail(429, "rate_limited", "Too many requests. Wait a minute.", { "Retry-After": String(rate.retryAfterSec) });

  const { id } = await ctx.params;
  const vote = findVote(id);
  if (!vote) return fail(404, "not_found", "There is no vote here.");

  try {
    const doc = await ballotsExport(vote, snapshotFor(vote), excludedForVote(vote));
    const cache = "public, s-maxage=10, stale-while-revalidate=30";
    if (new URL(req.url).searchParams.get("format") === "csv") {
      return new Response(ballotsCsv(doc.ballots), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="gloam-vote-${vote.id}.csv"`,
          "Cache-Control": cache,
        },
      });
    }
    const download = new URL(req.url).searchParams.get("download") === "1";
    return NextResponse.json(doc, {
      headers: {
        "Cache-Control": cache,
        ...(download ? { "Content-Disposition": `attachment; filename="gloam-vote-${vote.id}.json"` } : {}),
      },
    });
  } catch (e) {
    if (e instanceof KvUnavailableError) return fail(503, "storage", "Votes are not available for a moment. Try again shortly.");
    return fail(500, "error", "Something went wrong reading the votes.");
  }
}
