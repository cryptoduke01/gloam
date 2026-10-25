"use client";

import { useQuery } from "@tanstack/react-query";
import { RH_MAINNET_SWAP_TOKENS, RH_MAINNET_TOKENS } from "@/lib/tokens";

/**
 * Robinhood Chain mainnet tokens the markets feed does not price ($GLOAM, and
 * the swap tokens such as cbBTC), priced from CoinGecko like Transparency does.
 * The list is fixed, never the viewer's holdings, so the request says nothing
 * about what this wallet holds. Stocks come from the markets feed, WETH from
 * ETH's price and dollar stablecoins are $1, so they are not asked for here.
 */
export const COINGECKO_MARKED = [...RH_MAINNET_TOKENS, ...RH_MAINNET_SWAP_TOKENS].filter(
  (t) => t.coingecko && t.kind === "token" && t.id !== "weth"
);

async function fetchMarks(): Promise<Map<string, number>> {
  const ids = [...new Set(COINGECKO_MARKED.map((t) => t.coingecko!))].join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error("coingecko");
  const g = (await res.json()) as Record<string, { usd?: number }>;
  const out = new Map<string, number>();
  for (const t of COINGECKO_MARKED) {
    const usd = g[t.coingecko!]?.usd;
    if (typeof usd === "number" && usd > 0) out.set(t.address.toLowerCase(), usd);
  }
  return out;
}

const EMPTY = new Map<string, number>();

/**
 * USD per unit by token address (lowercase), for the tokens above; empty until
 * read, or when `enabled` is false. `pending` is true until the first read
 * answers (a failed read is not pending: those tokens just have no price).
 */
export function useCoingeckoMarks(enabled: boolean): { marks: Map<string, number>; pending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["coingecko-marks"],
    queryFn: fetchMarks,
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  return enabled ? { marks: data ?? EMPTY, pending: isPending } : { marks: EMPTY, pending: false };
}
