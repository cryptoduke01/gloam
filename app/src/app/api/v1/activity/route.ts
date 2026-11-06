import { withApiKey } from "@/lib/partnersApi";
import { readPartnerStats, STATS_DAYS } from "@/lib/partners";
import { readFeesCharged } from "@/lib/partnerFees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Your attributed volume and fees charged on the key's tier (a live key:
 * mainnet; a test key: testnet): totals, by kind, source, network and asset, the
 * last 14 days, and up to ?limit= (default 50, max 200) recent cash outs, deposits
 * and swaps. Private payments are in the counts, never listed one by one.
 * feesCharged: your interface fees, each counted once its own private payment
 * landed, with the amount reported beside it (lib/partnerFees). commissionUsd and
 * each item's feeUsd are what your setting puts on that payment, not proof it was paid.
 */
export async function GET(req: Request) {
  return withApiKey(req, async ({ partner, key }) => {
    const raw = Number(new URL(req.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(200, Math.floor(raw))) : 50;
    const tier = key.env === "live" ? "mainnet" : "testnet";
    const [stats, feesCharged] = await Promise.all([readPartnerStats(partner.id, { recent: limit, tier, forPartner: true }), readFeesCharged(partner.id, tier)]);
    return { data: { ...stats, days: STATS_DAYS, fees: partner.fees, feesCharged, charged: false } };
  });
}
