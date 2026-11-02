import { ApiError, jsonBody, withApiKey } from "@/lib/partnersApi";
import { getNetwork, isNetworkKey, type GloamNetwork } from "@/lib/networks";
import { networkForChain } from "@/lib/relay/server";
import { SwapQuoteError, quoteSwapServer } from "@/lib/swapQuote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A quote body is a few short fields. */
const MAX_BODY_BYTES = 4_096;

function networkOf(body: Record<string, unknown>): GloamNetwork {
  if (body.network != null) {
    if (typeof body.network !== "string" || !isNetworkKey(body.network)) {
      throw new ApiError(400, "network", "network must be a Gloam network key, e.g. robinhood-mainnet.");
    }
    const net = getNetwork(body.network);
    if (body.chainId != null && Number(body.chainId) !== net.chainId) {
      throw new ApiError(400, "network", "network and chainId name different chains.");
    }
    return net;
  }
  return networkForChain(body.chainId);
}

/**
 * Quote a private swap: { chainId | network, assetIn, assetOut, amountIn, via? }.
 * amountIn is the note's value in base units, as a string. Read only: nothing is
 * proved or sent. The answer has the price, the route, and `stop`, the first thing
 * that would keep this swap from going (null when nothing does). Per-key rate
 * limits come from withApiKey.
 */
export async function POST(req: Request) {
  return withApiKey(req, async () => {
    const body = await jsonBody(req, MAX_BODY_BYTES);
    const net = networkOf(body);
    try {
      return { data: await quoteSwapServer(net, { assetIn: body.assetIn, assetOut: body.assetOut, amountIn: body.amountIn, via: body.via }) };
    } catch (e) {
      if (e instanceof SwapQuoteError) throw new ApiError(e.status, e.code, e.message);
      throw e;
    }
  });
}
