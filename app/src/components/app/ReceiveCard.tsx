"use client";

import { useState } from "react";
import { shortAddress } from "@/lib/chain";
import { useAppAccount } from "@/lib/demo";
import { useNetwork } from "./NetworkProvider";

export function ReceiveCard() {
  const { address, isConnected } = useAppAccount();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="gl-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="t-label">Receive</p>
        <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-[12px] text-mute">
          Public address
        </span>
      </div>
      {!isConnected || !address ? (
        <p className="mt-4 text-[14px] leading-relaxed text-mute">
          Connect a wallet to show your deposit address.
        </p>
      ) : (
        <>
          <p className="tnum mt-4 break-all text-[15px] leading-relaxed text-foreground">
            {address}
          </p>
          <p className="mt-1.5 text-[12.5px] text-mute">
            Anything sent here is public on {network.label}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn btn-ink">
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={network.explorerAddress(address)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Explorer, {shortAddress(address, 3)}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
