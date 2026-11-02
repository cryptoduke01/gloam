import { NextResponse, type NextRequest } from "next/server";
import { ApiError, portal, sessionWallet } from "@/lib/partnersApi";
import { activityCsv, dailyCsv, getPartnerByOwner, readPartnerStats, STATS_DAYS_MAX } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in partner's own figures as a spreadsheet, and no one else's.
 * ?type=daily (default): per day, source and kind, the last 120 days.
 * ?type=transactions: each counted transaction (the latest 200), public facts only.
 */
export async function GET(req: NextRequest) {
  return portal(async () => {
    const partner = await getPartnerByOwner(sessionWallet(req));
    if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
    const type = new URL(req.url).searchParams.get("type") ?? "daily";
    if (type !== "daily" && type !== "transactions") throw new ApiError(400, "bad_type", 'type must be "daily" or "transactions".');
    const stats = await readPartnerStats(partner.id, type === "daily" ? { days: STATS_DAYS_MAX } : { recent: 200, days: 1 });
    const csv = type === "daily" ? dailyCsv([{ id: partner.id, name: partner.name, daily: stats.daily }]) : activityCsv([{ id: partner.id, name: partner.name, recent: stats.recent }]);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gloam-partner-${type}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
