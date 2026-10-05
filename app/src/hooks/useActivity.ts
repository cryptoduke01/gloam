"use client";

import { useQuery } from "@tanstack/react-query";
import { useDemoActivity } from "@/lib/demo";

export type ActivityTx = {
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  timestamp: number;
  ok: boolean;
};

async function fetchActivity(address: string) {
  const res = await fetch(
    `/api/activity?address=${encodeURIComponent(address)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("activity_failed");
  return res.json() as Promise<{ txs: ActivityTx[] }>;
}

export function useActivity(address: string | undefined) {
  // Recording demo: the pretend wallet's history, nothing fetched.
  const demo = useDemoActivity();
  const query = useQuery({
    queryKey: ["activity", address],
    queryFn: () => fetchActivity(address!),
    enabled: Boolean(address) && !demo,
    staleTime: 12_000,
    refetchInterval: 30_000,
  });
  return demo ?? query;
}
