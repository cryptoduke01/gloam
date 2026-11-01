/**
 * What the checks before a payment share (wormholeGuard, veyaGuard): where a
 * key may be sent, how long to wait, the call itself, and how to read an answer
 * that is not to be trusted.
 */

export interface GuardEndpoint {
  key: string;
  url: string;
  timeoutMs: number;
}

const loopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/** The key rides along as a bearer token, so only https, or plain http on this machine (tests, a local proxy). */
export const keyMayGoTo = (url: URL): boolean => url.protocol === "https:" || (url.protocol === "http:" && loopback(url.hostname));

/** A timeout setting, held between half a second and 30 seconds. Unset or unusable is `fallback`. */
export function guardTimeoutMs(raw: string | undefined, fallback: number): number {
  const ms = Number(raw?.trim() || fallback);
  return Number.isFinite(ms) ? Math.min(Math.max(Math.round(ms), 500), 30_000) : fallback;
}

/** Plain characters only, capped: text from a check is attacker-reachable and must not reach the model as written. */
export const plainText = (v: unknown): string => (typeof v === "string" ? v.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 40) : "");

/** POST `body` as JSON with the key as a bearer token. Never throws, and a redirect is a failure: the key does not follow one. */
export async function postToGuard(
  to: GuardEndpoint,
  body: unknown,
  fetchImpl: typeof fetch
): Promise<{ res: Response } | { failed: "timeout" | "unreachable" }> {
  try {
    const res = await fetchImpl(to.url, {
      method: "POST",
      headers: { authorization: `Bearer ${to.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(to.timeoutMs),
    });
    return { res };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { failed: timedOut ? "timeout" : "unreachable" };
  }
}

/** The answer as a JSON object, or null when it is anything else. Never throws, and the timeout above still covers the read. */
export async function guardBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await res.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
