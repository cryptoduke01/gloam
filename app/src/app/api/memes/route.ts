import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Product is testnet-only. RH mainnet memes (DexScreener) stay off until we ship mainnet.
 * Endpoint kept so clients don't 404, returns empty + honest meta.
 */
export async function GET() {
  return NextResponse.json({
    memes: [],
    meta: {
      chain: "robinhood-testnet",
      count: 0,
      note: "Memes paused while product is testnet-only. No mainnet data mixed in.",
      fetchedAt: Date.now(),
    },
  });
}
