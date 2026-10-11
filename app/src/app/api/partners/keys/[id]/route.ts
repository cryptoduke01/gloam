import type { NextRequest } from "next/server";
import { ApiError, jsonBody, limitPortalWrite, portal, sessionWallet } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { renameApiKey, revokeApiKey } from "@/lib/apiKeys";
import { getPartnerByOwner } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownPartnerId(req: NextRequest) {
  const wallet = sessionWallet(req);
  await limitPortalWrite(wallet);
  const partner = await getPartnerByOwner(wallet);
  if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
  return partner.id;
}

/** Rename: { name }. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Edit keys from the Gloam site.");
    const partnerId = await ownPartnerId(req);
    const { id } = await ctx.params;
    const body = await jsonBody(req);
    return { data: { key: await renameApiKey({ partnerId, keyId: id, name: String(body.name ?? "") }) } };
  });
}

/** Revoke. The key stops working at once and cannot be brought back. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Revoke keys from the Gloam site.");
    const partnerId = await ownPartnerId(req);
    const { id } = await ctx.params;
    return { data: { key: await revokeApiKey({ partnerId, keyId: id }) } };
  });
}
