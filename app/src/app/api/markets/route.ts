import { NextResponse } from "next/server";
import { loadLiveMarkets } from "@/lib/live-quotes";

/** Always fetch fresh — do not bake static quotes at build time. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        error: e instanceof Error ? e.message : "quote_failed",
      },
      { status: 502 }
    );
  }
}
