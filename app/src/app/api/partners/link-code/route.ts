import { ApiError, portal } from "@/lib/partnersApi";
import { isLinkCodeShape, resolveLinkCode } from "@/lib/partnerLinks";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Code lookups per IP per minute: a link opens once, so a person never comes near it. */
const LOOKUPS_PER_MIN = 60;

/**
 * GET ?code=<link code>: the partner a live code is from, as the app shows it
 * ("From Motion"). The name comes from the partner's account, never from the
 * link. An unknown, revoked or expired code is a 404 and names nobody. Nothing
 * about the caller is kept.
 */
export async function GET(req: Request) {
  return portal(async () => {
    const rate = await hitRateLimit(clientIp(req), "partner-link", LOOKUPS_PER_MIN);
    if (!rate.allowed) throw new ApiError(429, "rate_limited", "Too many lookups from here. Wait a minute.");
    const code = new URL(req.url).searchParams.get("code");
    if (!isLinkCodeShape(code)) throw new ApiError(400, "bad_code", "That is not a partner link code.");
    const r = await resolveLinkCode(code);
    if (!r) throw new ApiError(404, "code_not_live", "That link code is not live.");
    return { data: { name: r.partner.name } };
  });
}
