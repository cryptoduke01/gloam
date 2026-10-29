import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { kvBackend } from "@/lib/partnersKv";
import { FEEDBACK_MAX_KEPT, feedbackCsv, listFeedback } from "@/lib/vote/feedback";
import { VOTES } from "@/lib/vote/config";
import { configProblems } from "@/lib/vote/core";
import { excludedForVote, snapshotFor } from "@/lib/vote/registry";
import { ballotsCsv, voteSummary } from "@/lib/vote/results";
import { listBallots } from "@/lib/vote/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * Admin only: every vote (drafts too) with its tallies and every ballot, and
 * every feedback note. ?format=csv&kind=votes[&vote=<id>] or kind=feedback
 * downloads a spreadsheet; ?download=1 the whole JSON.
 */
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: { message: "Admin session required." } }, { status: 401, headers: noStore });
  }
  const backend = kvBackend();
  const url = new URL(req.url);
  try {
    const votes = VOTES.filter((v) => configProblems(v).length === 0);
    const rows = await Promise.all(
      votes.map(async (v) => ({
        summary: await voteSummary(v, snapshotFor(v), excludedForVote(v)),
        ballots: backend === "none" ? [] : await listBallots(v.id),
      })),
    );
    const feedback = backend === "none" ? [] : await listFeedback();

    if (url.searchParams.get("format") === "csv") {
      const kind = url.searchParams.get("kind");
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "feedback") {
        return new Response(feedbackCsv(feedback), {
          headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gloam-feedback-${date}.csv"` },
        });
      }
      const only = url.searchParams.get("vote");
      const pick = rows.filter((r) => !only || r.summary.id === only);
      const csv = pick.length === 1 ? ballotsCsv(pick[0]!.ballots) : allVotesCsv(pick.map((r) => ({ id: r.summary.id, ballots: r.ballots })));
      return new Response(csv, {
        headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gloam-votes-${only ?? "all"}-${date}.csv"` },
      });
    }

    const data = { backend, kept: { ballots: "until deleted", feedback: `newest ${FEEDBACK_MAX_KEPT.toLocaleString("en-US")}` }, votes: rows, feedback };
    return NextResponse.json(
      { ok: true, data },
      { headers: { ...noStore, ...(url.searchParams.get("download") === "1" ? { "Content-Disposition": `attachment; filename="gloam-votes-and-feedback.json"` } : {}) } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: { message: "Could not read votes." } }, { status: 503, headers: noStore });
  }
}

function allVotesCsv(sets: { id: string; ballots: { voter: string; option: number; choice: string; weight: string; timestamp: number; signature: string }[] }[]): string {
  const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const header = ["vote", "voter", "option", "choice", "weight_wei", "signed_at_utc", "timestamp", "signature"];
  const lines = sets.flatMap((s) =>
    s.ballots.map((b) => [s.id, b.voter, String(b.option), b.choice, b.weight, new Date(b.timestamp * 1000).toISOString(), String(b.timestamp), b.signature].map(cell)),
  );
  return [header.map(cell), ...lines].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
