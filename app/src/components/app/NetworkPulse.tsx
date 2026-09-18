"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ensureWalletOnChain } from "@/lib/chain";
import { useNetwork } from "./NetworkProvider";
import { StatusPill } from "./StatusPill";

/** Minimal network status, one-tap fix when on the wrong chain. */
export function NetworkPulse() {
  const { network } = useNetwork();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const onProduct = chainId === network.chainId;
  const [busy, setBusy] = useState(false);

  // On the right network (or not yet connected) there is no status chip — the
  // header's network selector already names the chain. Only surface a control
  // when the wallet is on the wrong chain and needs switching.
  if (onProduct || !isConnected) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void ensureWalletOnChain(network.chain).finally(() => setBusy(false));
      }}
      className="inline-flex items-center"
      title={`Switch to ${network.label}`}
    >
      <StatusPill tone="warn" dot>
        {busy ? "Switching…" : "Wrong network · tap to fix"}
      </StatusPill>
    </button>
  );
}
