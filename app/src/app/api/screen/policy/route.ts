import { NextResponse } from "next/server";
import { poolNotice } from "@/lib/tip403";
import { tip403Applies, tip403AssetStatus } from "@/lib/tip403Server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Best effort, in memory: answers are cached per asset, this only stops a
// caller from using the route as a free RPC proxy.
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
 * The TIP-403 issuer policy of a Tempo stablecoin and what it means for the
 * Gloam vault. Public chain data only: no wallet address is asked for.
 *
 * GET /api/screen/policy?chainId=42431&asset=0x20c0...
 *   { ok: true, applies: false }                    not a Tempo TIP-20 asset
 *   { ok: true, applies: true, status: null }       the chain did not answer
 *   { ok: true, applies: true, status, notices }    status: policy id + kind,
 *     paused, poolCanReceive, poolCanSend; notices: the warning per flow, or null
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chainId"));
  const asset = url.searchParams.get("asset");
  if (!tip403Applies(chainId, asset)) {
    return NextResponse.json({ ok: true, applies: false }, { headers: NO_STORE });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  if (!allow(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Wait a few minutes." }, { status: 429, headers: NO_STORE });
  }
  try {
    const status = await tip403AssetStatus(chainId, asset);
    if (!status) return NextResponse.json({ ok: true, applies: false }, { headers: NO_STORE });
    return NextResponse.json(
      {
        ok: true,
        applies: true,
        status,
        notices: { deposit: poolNotice(status, "deposit"), cashout: poolNotice(status, "cashout") },
      },
      { headers: NO_STORE }
    );
  } catch {
    return NextResponse.json({ ok: true, applies: true, status: null }, { headers: NO_STORE });
  }
}
