"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { EXPLORER_ADDRESS, shortAddress } from "@/lib/chain";
import { StatusPill } from "./StatusPill";

export function ReceiveCard() {
  const { address, isConnected } = useAccount();
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
    <div className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Receive
        </p>
        <StatusPill tone="lime">Public address</StatusPill>
      </div>
      {!isConnected || !address ? (
        <p className="mt-3 text-sm text-mute">Connect to show your deposit address.</p>
      ) : (
        <>
          <p className="mt-3 break-all font-mono text-sm text-foreground">
            {address}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90"
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={EXPLORER_ADDRESS(address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm text-foreground hover:border-mute"
            >
              Explorer · {shortAddress(address, 3)}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
