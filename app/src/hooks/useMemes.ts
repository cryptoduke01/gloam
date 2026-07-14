"use client";

import { useQuery } from "@tanstack/react-query";
import type { DexPair } from "@/lib/dexscreener";

type Api = {
  memes: DexPair[];
  meta?: { count: number; chain: string };
};

async function fetchMemes(): Promise<Api> {
  const res = await fetch(`/api/memes?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("memes_failed");
  return res.json() as Promise<Api>;
}

export function useMemes() {
  return useQuery({
    queryKey: ["memes", "robinhood"],
    queryFn: fetchMemes,
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
