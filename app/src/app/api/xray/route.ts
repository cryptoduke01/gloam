import { NextRequest, NextResponse } from "next/server";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { XrayReadFailed, readBalances, resolveEnsName, type XrayBalances } from "@/lib/xray/balances";
import { parseXrayQuery } from "@/lib/xray/input";

/**
 * The Wallet X-ray's lookup: a wallet's public balances, for the page that
 * shows them. POST, so the wallet is in the body and never in a URL this route
 * has to answer for (access logs, the CDN). Nothing here logs, stores or counts
 * the wallet: the limits below count hashed IPs and one shared total.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Lookups per IP per minute, counted across instances. A person looks up a few wallets; a script looks up thousands. */
const PER_IP_PER_MIN = 15;
/** Every lookup together, each a few RPC calls on the same public node the rest of the server reads from. */
const ALL_PER_MIN = 300;
/** A wallet or a name fits in far less. */
const MAX_BODY = 256;

export type XrayLookup = { address: `0x${string}`; balances: XrayBalances };
export type XrayLookupError = "bad_request" | "invalid" | "no_such_name" | "rate_limited" | "busy" | "read_failed";

function fail(error: XrayLookupError, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(req: NextRequest) {
  const rate = await hitRateLimit(clientIp(req), "xray", PER_IP_PER_MIN);
  if (!rate.allowed) return fail("rate_limited", 429, { "Retry-After": String(rate.retryAfterSec) });
  const all = await hitRateLimit("all", "xray-all", ALL_PER_MIN);
  if (!all.allowed) return fail("busy", 503, { "Retry-After": String(all.retryAfterSec) });

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return fail("bad_request", 413);
  let body: { query?: unknown };
  try {
    body = JSON.parse(raw) as { query?: unknown };
  } catch {
    return fail("bad_request", 400);
  }

  const query = parseXrayQuery(body?.query);
  if (query.kind === "invalid") return fail("invalid", 400);

  try {
    const address = query.kind === "address" ? query.address : await resolveEnsName(query.name);
    if (!address) return fail("no_such_name", 404);
    const balances = await readBalances(address);
    const lookup: XrayLookup = { address, balances };
    return NextResponse.json(lookup, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // never the error itself: a viem error carries the request, wallet included
    if (!(e instanceof XrayReadFailed)) console.warn("gloam_xray_read_failed");
    return fail("read_failed", 502);
  }
}
