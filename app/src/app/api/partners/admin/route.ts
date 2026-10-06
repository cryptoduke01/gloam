import { isAdminAuthenticated } from "@/lib/adminAuth";
import { activeKeyCounts } from "@/lib/apiKeys";
import { ApiError, portal } from "@/lib/partnersApi";
import { listPartners, partnerView, readAllPartnerTotals, readPartnerStats } from "@/lib/partners";
import { kvBackend } from "@/lib/partnersKv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: every partner, their keys and attributed volume, plus program totals. */
export async function GET() {
  return portal(async () => {
    if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
    const backend = kvBackend();
    if (backend === "none") {
      return { data: { backend, partners: [], totals: null } };
    }
    const partners = await listPartners();
    const ids = partners.map((p) => p.id);
    const [totals, keys, all] = await Promise.all([readAllPartnerTotals(ids), activeKeyCounts(ids), readPartnerStats("all")]);
    return {
      data: {
        backend,
        partners: partners.map((p) => ({
          ...partnerView(p),
          activeKeys: keys[p.id] ?? 0,
          totals: totals[p.id] ?? null,
        })),
        totals: all.totals,
        daily: all.daily,
      },
    };
  });
}
