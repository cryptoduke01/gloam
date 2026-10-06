import { ApiError, apiFail, apiOk, newRequestId } from "@/lib/partnersApi";
import { issueNonce, MESSAGE_MAX_LIFETIME_SEC, nonceAllowed, requestHost, sessionsConfigured, SIWE_STATEMENT } from "@/lib/partnersAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A one-time nonce for the partner sign-in message, plus the exact statement
 * and limits the server will check. Valid for ten minutes.
 */
export async function GET(req: Request) {
  const requestId = newRequestId();
  try {
    if (!sessionsConfigured(requestHost(req))) {
      throw new ApiError(503, "keys_unconfigured", "Partner sign-in is not configured on this server yet.");
    }
    const client =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
    if (!nonceAllowed(client)) {
      throw new ApiError(429, "rate_limited", "Too many sign-in attempts from here. Wait a few minutes.");
    }
    const { nonce, expiresAt } = await issueNonce();
    return apiOk(
      { nonce, expiresAt, statement: SIWE_STATEMENT, maxLifetimeSec: MESSAGE_MAX_LIFETIME_SEC },
      { requestId }
    );
  } catch (e) {
    return apiFail(e, { requestId });
  }
}
