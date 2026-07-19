"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import {
  SHIELD_POOL_ADDRESS,
  isShieldDeployed,
  shieldPoolAbi,
} from "@/lib/shield";

/**
 * Pool inventory for an asset (`deposited[asset]`).
 * Cash-out (unshield) needs this balance; sealed swap does not move it.
 */
export function usePoolDeposited(asset: Address | undefined | null) {
  const enabled = Boolean(
    isShieldDeployed() && SHIELD_POOL_ADDRESS && asset
  );

  const q = useReadContract({
    address: SHIELD_POOL_ADDRESS ?? undefined,
    abi: shieldPoolAbi,
    functionName: "deposited",
    args: asset ? [asset] : undefined,
    chainId: PRODUCT_CHAIN_ID,
    query: {
      enabled,
      refetchInterval: 12_000,
    },
  });

  return {
    deposited: (q.data as bigint | undefined) ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
