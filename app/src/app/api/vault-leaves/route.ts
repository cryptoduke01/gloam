import { after, NextResponse, type NextRequest } from "next/server";
import { isNetworkKey } from "@/lib/networks";
import { getLeafSnapshot } from "@/lib/leafIndexServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/vault-leaves?network=robinhood|tempo
 *
 * The live vault's public leaf list (every commitment in insertion order, with
 * leaf index, block and tx), so the app can rebuild the Merkle tree from one
 * request instead of walking the chain. The request names only the network:
 * the same URL and the same answer for everyone, so it is cacheable at the CDN
 * and says nothing about who asks or which notes are theirs. The app checks
 * the rebuilt root against the pool on chain before using it.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("network");
  if (!isNetworkKey(key)) {
    return NextResponse.json({ error: "unknown_network" }, { status: 400, headers: NO_STORE });
  }
  try {
    // A refresh of the kept copy runs after the response is sent.
    const snap = await getLeafSnapshot(key, (task) => after(task));
    if (!snap) return NextResponse.json({ error: "no_live_pool" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(snap, {
      headers: {
        // The app reads anything after `toBlock` from the chain itself, so a
        // slightly old copy only costs it a slightly wider read.
        "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
