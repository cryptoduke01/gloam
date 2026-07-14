"use client";

import { useBlockNumber, useChainId } from "wagmi";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import { StatusPill } from "./StatusPill";

export function NetworkPulse() {
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { data: block, isError } = useBlockNumber({
    chainId: PRODUCT_CHAIN_ID,
    watch: true,
    query: { refetchInterval: 12_000 },
  });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
      {onProduct ? (
        <StatusPill tone="lime">RH testnet</StatusPill>
      ) : (
        <StatusPill tone="warn">Wrong network</StatusPill>
      )}
      <span className="font-mono">
        {isError
          ? "RPC unreachable"
          : block != null
            ? `block ${block.toString()}`
            : "syncing…"}
      </span>
      <span className="font-mono text-mute/70">46630</span>
    </div>
  );
}
