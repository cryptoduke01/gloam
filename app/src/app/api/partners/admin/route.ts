import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { activeKeyCounts } from "@/lib/apiKeys";
import { ApiError, jsonBody, portal } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { listPartners, partnerView, readAllPartnerTotals, readPartnerStats, setRelayApproved } from "@/lib/partners";
import { kvBackend } from "@/lib/partnersKv";
import { linkCodeState, listLinkCodes } from "@/lib/partnerLinks";
import { countAddresses, getPartnerAddresses } from "@/lib/partnerAddresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: every partner, their keys, link codes, receiving addresses and attributed volume by source, plus program totals. */
export async function GET() {
  return portal(async () => {
    if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
    const backend = kvBackend();
    if (backend === "none") {
      return { data: { backend, partners: [], totals: null } };
    }
    const partners = await listPartners();
    const ids = partners.map((p) => p.id);
    const now = Date.now();
    const [totals, keys, all, codes, addrs] = await Promise.all([
      readAllPartnerTotals(ids),
      activeKeyCounts(ids),
      readPartnerStats("all"),
      Promise.all(ids.map((id) => listLinkCodes(id))),
      Promise.all(ids.map((id) => getPartnerAddresses(id))),
    ]);
    return {
      data: {
        backend,
        partners: partners.map((p, i) => ({
          ...partnerView(p),
          activeKeys: keys[p.id] ?? 0,
          liveCodes: codes[i]!.filter((c) => linkCodeState(c, now) === "live").length,
          addresses: countAddresses(addrs[i]!),
          totals: totals[p.id] ?? null,
        })),
        totals: all.totals,
        bySource: all.bySource,
        daily: all.daily,
      },
    };
  });
}

/**
 * Admin only: { id, relayApproved }. An approved account's payment messages use the
 * relay's larger message budget (lib/relay/server, relayMemo).
 */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Change partners from the Gloam site.");
    if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
    const body = await jsonBody(req);
    if (typeof body.id !== "string" || typeof body.relayApproved !== "boolean") {
      throw new ApiError(400, "bad_request", "Send { id, relayApproved: true | false }.");
    }
    const partner = await setRelayApproved(body.id, body.relayApproved);
    if (!partner) throw new ApiError(404, "not_found", "No partner with that id.");
    return { data: { partner: partnerView(partner) } };
  });
}
