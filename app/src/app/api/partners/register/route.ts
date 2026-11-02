import type { NextRequest } from "next/server";
import { ApiError, jsonBody, portal } from "@/lib/partnersApi";
import { gloamOriginJson } from "@/lib/partnersAuth";
import { readRegisterInput, registerLink } from "@/lib/partnerAttribution";
import { networkForChain } from "@/lib/relay/server";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registrations per IP per minute: one per wallet-sent payment or cash out. */
const PER_IP_PER_MIN = 30;
/** Per link code and IP: one person's browser, not a flood against one partner. */
const PER_CODE_IP_PER_MIN = 20;

/**
 * POST { chainId, nullifierHash, code, flow }: before a wallet sends a payment or
 * a cash out opened from a partner's link, the app registers the spend under the
 * link's code (lib/partnerAttribution). nullifierHash is
 * keccak256("gloam-partner-link-v1" ‖ nullifier): it names the spend without
 * revealing it. Only a registration made before the transaction's block counts,
 * and the earliest one of a spend wins. Nothing about the caller is kept. The app
 * sends this and never waits on it.
 */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!gloamOriginJson(req)) throw new ApiError(403, "bad_origin", "Register from the Gloam app.");
    const ip = clientIp(req);
    if (!(await hitRateLimit(ip, "partner-reg", PER_IP_PER_MIN)).allowed) {
      throw new ApiError(429, "rate_limited", "Too many registrations from here. Wait a minute.");
    }
    const input = readRegisterInput(await jsonBody(req, 512));
    try {
      networkForChain(input.chainId);
    } catch {
      throw new ApiError(400, "bad_chain", "Gloam does not run a vault on that chain.");
    }
    if (!(await hitRateLimit(`${input.code}:${ip}`, "partner-reg-code", PER_CODE_IP_PER_MIN)).allowed) {
      throw new ApiError(429, "rate_limited", "Too many registrations for this link from here.");
    }
    const r = await registerLink({ ...input, via: "app" });
    if (r.reason === "code_not_live") throw new ApiError(404, "code_not_live", "That link code is not live.");
    return { data: { registered: r.registered }, status: r.registered ? 201 : 200 };
  });
}
