"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from "wagmi";
import {
  PRODUCT_CHAIN_ID,
  ensureRhTestnetWallet,
  shortAddress,
} from "@/lib/chain";

export function ConnectButton({ className = "" }: { className?: string }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [netErr, setNetErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isConnected || !address) return;
    void import("@/lib/track").then(({ track }) => {
      track("wallet_connect", { chainId });
    });
  }, [isConnected, address, chainId]);

  async function onSwitch() {
    setNetErr(null);
    setBusy(true);
    try {
      try {
        await switchChain({ chainId: PRODUCT_CHAIN_ID });
      } catch {
        await ensureRhTestnetWallet();
        await switchChain({ chainId: PRODUCT_CHAIN_ID });
      }
    } catch (e) {
      setNetErr(
        e instanceof Error ? e.message.slice(0, 140) : "Could not switch network"
      );
    } finally {
      setBusy(false);
    }
  }

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
        <div className={className}>
          <button
            type="button"
            onClick={onSwitch}
            disabled={switching || busy}
            className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
          >
            {switching || busy ? "Switching…" : "Add / switch RH testnet"}
          </button>
          {netErr && (
            <p className="mt-1 max-w-[16rem] text-[11px] text-red-400">{netErr}</p>
          )}
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="hidden items-center gap-1.5 text-xs text-mute sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />
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
        onClick={() => {
          void import("@/lib/track").then(({ track }) => {
            track("wallet_connect_click");
          });
          if (connector) connect({ connector });
        }}
        disabled={!connector || isPending || isConnecting}
        className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
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
