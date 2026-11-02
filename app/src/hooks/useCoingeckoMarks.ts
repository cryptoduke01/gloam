"use client";

import { useQuery } from "@tanstack/react-query";

export { COINGECKO_MARKED, hasCoingeckoMarks } from "@/lib/markedTokens";

/** The server reads the prices (CoinGecko, then DEX Screener): see lib/tokenMarksServer. */
async function fetchMarks(): Promise<Map<string, number>> {
  const res = await fetch("/api/token-marks", { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("token-marks");
  const { marks } = (await res.json()) as { marks?: Record<string, unknown> };
  const out = new Map<string, number>();
  for (const [address, usd] of Object.entries(marks ?? {})) {
    if (typeof usd === "number" && usd > 0) out.set(address.toLowerCase(), usd);
  }
  return out;
}

const EMPTY = new Map<string, number>();

/**
 * USD per unit by token address (lowercase), for the tokens in lib/markedTokens;
 * empty until read, or when `enabled` is false. `pending` is true until the
 * first read answers (a failed read is not pending: those tokens just have no
 * price).
 */
export function useCoingeckoMarks(enabled: boolean): { marks: Map<string, number>; pending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["token-marks"],
    queryFn: fetchMarks,
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  return enabled ? { marks: data ?? EMPTY, pending: isPending } : { marks: EMPTY, pending: false };
}
