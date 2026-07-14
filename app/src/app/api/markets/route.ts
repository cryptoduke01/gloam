import { NextResponse } from "next/server";
import { loadLiveMarkets } from "@/lib/live-quotes";

export const revalidate = 30;

/**
 * Live market marks for the product UI.
 * GET /api/markets → Market[] with source + updatedAt
 */
export async function GET() {
  try {
    const markets = await loadLiveMarkets();
    const liveCount = markets.filter((m) => m.source !== "static").length;
    return NextResponse.json(
      {
        markets,
        meta: {
          liveCount,
          total: markets.length,
          sources: ["yahoo", "coingecko"],
          note: "Marks are reference prices, not fills. RH stock-token oracles wire next.",
          fetchedAt: Date.now(),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        markets: [],
        error: e instanceof Error ? e.message : "quote_failed",
      },
      { status: 502 }
    );
  }
}
