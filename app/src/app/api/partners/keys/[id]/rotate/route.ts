import type { NextRequest } from "next/server";
import { ApiError, limitPortalWrite, portal, portalPepper, sessionWallet } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { rotateApiKey } from "@/lib/apiKeys";
import { getPartnerByOwner } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** New secret for the same key; the old secret stops working at once. Shown once. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Rotate keys from the Gloam site.");
    const wallet = sessionWallet(req);
    await limitPortalWrite(wallet);
    const partner = await getPartnerByOwner(wallet);
    if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
    const { id } = await ctx.params;
    const pepper = portalPepper(req);
    const { key, secret } = await rotateApiKey({ partnerId: partner.id, keyId: id, pepper });
    return { data: { key, secret } };
  });
}
