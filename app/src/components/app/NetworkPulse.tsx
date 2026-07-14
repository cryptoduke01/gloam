"use client";

import { useChainId } from "wagmi";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import { StatusPill } from "./StatusPill";

/** Minimal network status — no block numbers / chain IDs in the UI. */
export function NetworkPulse() {
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;

  if (onProduct) {
    return <StatusPill tone="lime">Testnet</StatusPill>;
  }

  return <StatusPill tone="warn">Wrong network</StatusPill>;
}
