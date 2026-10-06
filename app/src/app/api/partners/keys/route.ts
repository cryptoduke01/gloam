import type { NextRequest } from "next/server";
import { ApiError, jsonBody, portal, portalPepper, sessionWallet } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { createApiKey, listApiKeys, MAX_ACTIVE_KEYS } from "@/lib/apiKeys";
import { getPartnerByOwner } from "@/lib/partners";
import { NETWORK_KEYS, getNetwork } from "@/lib/networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownPartner(req: NextRequest) {
  const wallet = sessionWallet(req);
  const partner = await getPartnerByOwner(wallet);
  if (!partner) throw new ApiError(404, "no_account", "Create your partner account first.");
  return partner;
}

/** Live keys open once Gloam runs on a mainnet. */
function liveKeysOpen(): boolean {
  return NETWORK_KEYS.map(getNetwork).some((n) => n.status === "live" && n.chain.testnet !== true);
}

export async function GET(req: NextRequest) {
  return portal(async () => {
    const partner = await ownPartner(req);
    return { data: { keys: await listApiKeys(partner.id), maxActive: MAX_ACTIVE_KEYS, liveKeys: liveKeysOpen() } };
  });
}

/** { name, env?: "test" | "live" }. The secret is in this response and nowhere else. */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Make keys from the Gloam site.");
    const partner = await ownPartner(req);
    const body = await jsonBody(req);
    const env = body.env === undefined ? "test" : body.env;
    if (env !== "test" && env !== "live") throw new ApiError(400, "bad_env", 'env must be "test" or "live".');
    if (env === "live" && !liveKeysOpen()) {
      throw new ApiError(400, "live_unavailable", "Live keys open when Gloam launches on mainnet. Use a test key for now.");
    }
    const pepper = portalPepper(req);
    const { key, secret } = await createApiKey({ partnerId: partner.id, name: String(body.name ?? ""), env, pepper });
    return { data: { key, secret }, status: 201 };
  });
}
