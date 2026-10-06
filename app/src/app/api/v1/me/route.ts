import { withApiKey } from "@/lib/partnersApi";
import { KEY_RATE_LIMIT, KEY_RATE_WINDOW_SEC } from "@/lib/apiKeys";
import { partnerView } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The partner and key behind this key. A cheap way to test a key. */
export async function GET(req: Request) {
  return withApiKey(req, async ({ key, partner, rate }) => {
    const p = partnerView(partner);
    return {
      data: {
        partner: { id: p.id, name: p.name, website: p.website, fees: p.fees, payout: p.payout },
        key: { id: key.id, env: key.env },
        rateLimit: { limit: KEY_RATE_LIMIT, windowSec: KEY_RATE_WINDOW_SEC, remaining: rate.remaining },
        charged: false,
      },
    };
  });
}
