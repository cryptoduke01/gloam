import type { NextRequest } from "next/server";
import { ApiError, jsonBody, limitPortalWrite, portal, sessionWallet } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { FEE_LIMITS, getPartnerByOwner, partnerView, upsertPartner } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in wallet's partner account (null before it is made) and the fee limits. */
export async function GET(req: NextRequest) {
  return portal(async () => {
    const wallet = sessionWallet(req);
    const partner = await getPartnerByOwner(wallet);
    return { data: { wallet, partner: partner ? partnerView(partner) : null, feeLimits: FEE_LIMITS } };
  });
}

/**
 * Make or update the account: { name, website, payout: { robinhood, tempo }, fees:
 * { privatePaymentCents, cashoutBps, depositBps } }. Fields left out keep their value.
 */
export async function PUT(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Save from the Gloam site.");
    const wallet = sessionWallet(req);
    await limitPortalWrite(wallet);
    const body = await jsonBody(req);
    const partner = await upsertPartner(wallet, {
      name: body.name,
      website: body.website,
      payout: body.payout,
      fees: body.fees,
    });
    return { data: { wallet, partner: partnerView(partner), feeLimits: FEE_LIMITS } };
  });
}
