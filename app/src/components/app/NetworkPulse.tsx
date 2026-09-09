"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ensureRhTestnetWallet } from "@/lib/chain";
import { useNetwork } from "./NetworkProvider";
import { StatusPill } from "./StatusPill";

/** Minimal network status, one-tap fix when on the wrong chain. */
export function NetworkPulse() {
  const { network } = useNetwork();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const onProduct = chainId === network.chainId;
  const [busy, setBusy] = useState(false);

  if (onProduct) {
    return (
      <StatusPill tone="lime" dot>
        Testnet
      </StatusPill>
    );
  }
  if (!isConnected) {
    return (
      <StatusPill tone="mute" dot>
        Disconnected
      </StatusPill>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void ensureRhTestnetWallet().finally(() => setBusy(false));
      }}
      className="inline-flex items-center"
      title="Switch to Robinhood testnet"
    >
      <StatusPill tone="warn" dot>
        {busy ? "Switching…" : "Wrong network · tap to fix"}
      </StatusPill>
    </button>
  );
}
