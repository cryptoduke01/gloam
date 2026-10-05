/**
 * Fetch for agent-named URLs. gloam_fetch_paid requests whatever URL the agent
 * passes, and the agent may be steered by a page it read, so the server refuses
 * to reach loopback, private, link-local or cloud-metadata addresses, including
 * through a redirect. GLOAM_FETCH_ALLOW_PRIVATE=1 lifts this for local testing.
 *
 * The check resolves the name first and fetch resolves it again, so a host that
 * changes its DNS answer between the two (rebinding) is not fully covered.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Loopback, private, link-local, carrier-grade NAT, metadata, multicast or unspecified. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]!);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    /^fe[89ab]/.test(v6) ||
    v6.startsWith("ff")
  );
}

/** Why the server will not fetch this URL, or null when it may. */
export async function publicUrlProblem(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Not a valid URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Only http and https URLs.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) return `Could not resolve ${host}.`;
  if (addresses.some(isPrivateAddress)) {
    return `${host} points to a private or local address, which this server will not fetch.`;
  }
  return null;
}

/** fetch that checks every hop (the URL and each redirect) with publicUrlProblem. */
export function guardedFetch(env: Record<string, string | undefined>): typeof fetch {
  const allowPrivate = env.GLOAM_FETCH_ALLOW_PRIVATE === "1";
  return async (input, init) => {
    let url = input instanceof Request ? input.url : String(input);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!allowPrivate) {
        const problem = await publicUrlProblem(url);
        if (problem) throw new Error(problem);
      }
      const res = await fetch(url, { ...init, redirect: "manual" });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) return res;
      url = new URL(location, url).toString();
    }
    throw new Error("Too many redirects.");
  };
}
