import type { NextRequest } from "next/server";
import { ApiError, jsonBody, limitPortalWrite, portal, sessionWallet } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { getPartnerByOwner } from "@/lib/partners";
import { issueLinkCode, linkCodeView, listLinkCodes, MAX_LIVE_CODES } from "@/lib/partnerLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownPartner(req: NextRequest, write = false) {
  const wallet = sessionWallet(req);
  if (write) await limitPortalWrite(wallet);
  const partner = await getPartnerByOwner(wallet);
  if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
  return partner;
}

/** The signed-in partner's link codes, revoked and expired ones included. */
export async function GET(req: NextRequest) {
  return portal(async () => {
    const partner = await ownPartner(req);
    const now = Date.now();
    return { data: { codes: (await listLinkCodes(partner.id)).map((c) => linkCodeView(c, now)), maxLive: MAX_LIVE_CODES } };
  });
}

/** { label?, expiresInDays? }: a new link code for pay and swap links (`p=<code>`). */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Make link codes from the Gloam site.");
    const partner = await ownPartner(req, true);
    const body = await jsonBody(req, 1024);
    const code = await issueLinkCode({ partnerId: partner.id, label: body.label, expiresInDays: body.expiresInDays, by: "partner" });
    return { data: { code: linkCodeView(code) }, status: 201 };
  });
}
