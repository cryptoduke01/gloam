import { NextResponse } from "next/server";
import { loadEthUsd, loadLiveMarkets } from "@/lib/live-quotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [markets, ethUsd] = await Promise.all([
      loadLiveMarkets(),
      loadEthUsd(),
    ]);
    const liveCount = markets.filter((m) => m.source === "live").length;
    return NextResponse.json(
      {
        markets,
        ethUsd,
        meta: {
          liveCount,
          total: markets.length,
          fetchedAt: Date.now(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        markets: [],
        ethUsd: null,
        error: e instanceof Error ? e.message : "quote_failed",
      },
      { status: 502 }
    );
  }
}
