"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { PRODUCT_CHAIN_ID, shortAddress } from "@/lib/chain";

export function ConnectButton({ className = "" }: { className?: string }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm text-mute ${className}`}
      >
        Connect
      </button>
    );
  }

  if (isConnected && address) {
    const wrong = chainId !== PRODUCT_CHAIN_ID;
    if (wrong) {
      return (
        <button
          type="button"
          onClick={() => switchChain({ chainId: PRODUCT_CHAIN_ID })}
          disabled={switching}
          className={`inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60 ${className}`}
        >
          {switching ? "Switching…" : "Switch to RH testnet"}
        </button>
      );
    }
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="hidden font-mono text-xs text-mute sm:inline">
          {shortAddress(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm text-foreground hover:border-mute"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const connector = connectors[0];

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => connector && connect({ connector })}
        disabled={!connector || isPending || isConnecting}
        className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {isPending || isConnecting ? "Connecting…" : "Connect wallet"}
      </button>
      {error && (
        <p className="mt-1 max-w-[14rem] text-[11px] text-red-400">
          {error.message.slice(0, 120)}
        </p>
      )}
    </div>
  );
}
