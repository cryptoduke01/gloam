"use client";

import { useQuery } from "@tanstack/react-query";
import { MARKETS, type Market } from "@/lib/markets";

type ApiResponse = {
  markets: Market[];
  meta?: {
    liveCount: number;
    total: number;
    fetchedAt: number;
    note?: string;
  };
};

async function fetchMarkets(): Promise<ApiResponse> {
  const res = await fetch("/api/markets", { cache: "no-store" });
  if (!res.ok) throw new Error("markets_failed");
  return res.json() as Promise<ApiResponse>;
}

export function useLiveMarkets() {
  return useQuery({
    queryKey: ["markets", "live"],
    queryFn: fetchMarkets,
    staleTime: 20_000,
    refetchInterval: 40_000,
    retry: 2,
    // Show catalog instantly; swap when live payload arrives
    placeholderData: {
      markets: MARKETS,
      meta: {
        liveCount: 0,
        total: MARKETS.length,
        fetchedAt: 0,
      },
    },
  });
}
