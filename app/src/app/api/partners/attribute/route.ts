import type { NextRequest } from "next/server";
import { ApiError, jsonBody, portal } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { attributeLinkTx, readAttributionInput } from "@/lib/partnerAttribution";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Reports per IP per minute: one per payment or swap a person makes. */
const PER_IP_PER_MIN = 30;
/** Reports per link code per minute, across everyone: room for a busy partner, not for a flood. */
const PER_CODE_PER_MIN = 300;

/**
 * POST { code, chainId, txHash, flow }: a payment or swap opened from a partner's
 * link has landed (lib/partnerAttribution). The server reads the transaction on
 * that chain itself and counts it to the code's partner only when it is a real
 * vault action of that flow. Only public facts about the transaction are kept;
 * never the caller's IP or wallet. The app sends this and never waits on it.
 */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Report from the Gloam app.");
    const ip = await hitRateLimit(clientIp(req), "partner-attr", PER_IP_PER_MIN);
    if (!ip.allowed) throw new ApiError(429, "rate_limited", "Too many reports from here. Wait a minute.");
    const input = readAttributionInput(await jsonBody(req, 512));
    const perCode = await hitRateLimit(`code:${input.code}`, "partner-attr-code", PER_CODE_PER_MIN);
    if (!perCode.allowed) throw new ApiError(429, "rate_limited", "Too many reports for this link right now.");
    const r = await attributeLinkTx(input);
    return { data: { recorded: true, kind: r.kind }, status: 201 };
  });
}
