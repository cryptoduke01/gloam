import { withApiKey } from "@/lib/partnersApi";
import { readPartnerStats, STATS_DAYS } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Your attributed volume and would-be commissions: totals, by kind, network and
 * asset, the last 14 days, and up to ?limit= (default 50, max 200) recent items.
 */
export async function GET(req: Request) {
  return withApiKey(req, async ({ partner }) => {
    const raw = Number(new URL(req.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(200, Math.floor(raw))) : 50;
    const stats = await readPartnerStats(partner.id, { recent: limit });
    return { data: { ...stats, days: STATS_DAYS, fees: partner.fees, charged: false } };
  });
}
