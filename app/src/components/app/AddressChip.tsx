"use client";

import { useState } from "react";
import { shortAddress } from "@/lib/chain";

export function AddressChip({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy address"}
      className={`group inline-flex items-center gap-1.5 rounded-md text-[11px] text-mute transition-colors hover:text-foreground ${className}`}
    >
      <span>{shortAddress(address, 4)}</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded text-mute group-hover:text-lime">
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="9"
              y="9"
              width="11"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M5 15V7a2 2 0 0 1 2-2h8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <span className="sr-only">{copied ? "Copied" : "Copy address"}</span>
    </button>
  );
}
