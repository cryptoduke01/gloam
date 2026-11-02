import { NextResponse, type NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { ApiError, portal } from "@/lib/partnersApi";
import { activityCsv, dailyCsv, getPartner, listPartners, readPartnerStats, STATS_DAYS_MAX, type Partner } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin only, GET ?id=<partner id | all>&type=daily|transactions: the partner
 * figures as a spreadsheet. daily: per day, source and kind, the last 120 days.
 * transactions: each counted transaction (the latest 200 per partner), public facts only.
 */
export async function GET(req: NextRequest) {
  return portal(async () => {
    if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
    const q = new URL(req.url).searchParams;
    const type = q.get("type") ?? "daily";
    if (type !== "daily" && type !== "transactions") throw new ApiError(400, "bad_type", 'type must be "daily" or "transactions".');
    const id = q.get("id") ?? "all";
    let partners: Partner[];
    if (id === "all") partners = await listPartners();
    else {
      const p = await getPartner(id);
      if (!p) throw new ApiError(404, "not_found", "No partner with that id.");
      partners = [p];
    }
    const rows = await Promise.all(
      partners.map(async (p) => ({
        id: p.id,
        name: p.name,
        ...(await readPartnerStats(p.id, type === "daily" ? { days: STATS_DAYS_MAX } : { recent: 200, days: 1 })),
      }))
    );
    const csv = type === "daily" ? dailyCsv(rows) : activityCsv(rows);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gloam-partners-${id === "all" ? "all" : id}-${type}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
