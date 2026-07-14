import { NextResponse } from "next/server";
import { loadRobinhoodMemes } from "@/lib/dexscreener";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Robinhood mainnet memes from DexScreener (chainId "robinhood").
 * Not testnet faucet stocks — different network.
 */
export async function GET() {
  try {
    const memes = await loadRobinhoodMemes(48);
    return NextResponse.json(
      {
        memes,
        meta: {
          chain: "robinhood",
          note: "Mainnet RH memes via DexScreener. Testnet faucet stocks are separate.",
          count: memes.length,
          fetchedAt: Date.now(),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { memes: [], error: e instanceof Error ? e.message : "failed" },
      { status: 502 }
    );
  }
}
