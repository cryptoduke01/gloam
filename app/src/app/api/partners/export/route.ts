import { NextResponse, type NextRequest } from "next/server";
import { ApiError, portal, sessionWallet } from "@/lib/partnersApi";
import { activityCsv, dailyCsv, getPartnerByOwner, isTier, readPartnerStats, STATS_DAYS_MAX } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in partner's own figures for one tier as a spreadsheet, and no one else's.
 * ?type=daily (default): per day, network, source and kind, the last 120 days.
 * ?type=transactions: each counted cash out, deposit and swap (the latest 200),
 * public facts only. Private payments are never listed one by one: they are in the
 * daily counts only. ?tier=mainnet (default) or testnet.
 */
export async function GET(req: NextRequest) {
  return portal(async () => {
    const partner = await getPartnerByOwner(sessionWallet(req));
    if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
    const q = new URL(req.url).searchParams;
    const type = q.get("type") ?? "daily";
    if (type !== "daily" && type !== "transactions") throw new ApiError(400, "bad_type", 'type must be "daily" or "transactions".');
    const tier = q.get("tier") ?? "mainnet";
    if (!isTier(tier)) throw new ApiError(400, "bad_tier", 'tier must be "mainnet" or "testnet".');
    const stats = await readPartnerStats(partner.id, type === "daily" ? { days: STATS_DAYS_MAX, tier } : { recent: 200, days: 1, tier, forPartner: true });
    const csv = type === "daily" ? dailyCsv([{ id: partner.id, name: partner.name, daily: stats.daily }]) : activityCsv([{ id: partner.id, name: partner.name, recent: stats.recent }]);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gloam-partner-${tier}-${type}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
