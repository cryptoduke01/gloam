import { NextResponse } from "next/server";
import { SCREEN_BLOCKED_MESSAGE, SCREEN_LIST_INFO, normalizeAddress } from "@/lib/screening";
import { chainalysisEnabled, screenAddresses } from "@/lib/screeningServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Which list screening uses right now (no secrets, no addresses). */
export async function GET() {
  return NextResponse.json(
    { ok: true, list: SCREEN_LIST_INFO, chainalysis: chainalysisEnabled() },
    { headers: NO_STORE }
  );
}

// Best effort, in memory: the list is public, this only stops casual hammering.
const WINDOW_MS = 10 * 60_000;
const PER_IP = 120;
const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP) return false;
  list.push(now);
  if (hits.size > 10_000) hits.clear();
  hits.set(ip, list);
  return true;
}

/**
 * Screen public addresses before a deposit or a cash out.
 * Body: { addresses: string[] } (1 to 4 addresses). Addresses go in the body,
 * never the URL, and are never logged.
 * Returns { ok: true, allowed } and, when blocked, one neutral message.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { addresses?: unknown } | null;
  const addresses = body?.addresses;
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.length > 4 ||
    addresses.some((a) => normalizeAddress(a) === null)
  ) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  if (!allow(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Wait a few minutes." }, { status: 429, headers: NO_STORE });
  }
  const { allowed } = await screenAddresses(addresses);
  return NextResponse.json(
    allowed ? { ok: true, allowed } : { ok: true, allowed, message: SCREEN_BLOCKED_MESSAGE },
    { headers: NO_STORE }
  );
}
