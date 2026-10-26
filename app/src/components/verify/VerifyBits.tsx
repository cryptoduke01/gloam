"use client";

import { useState } from "react";
import { ArrowUpRight } from "@/components/ui/ArrowUpRight";

/** Small pieces /verify and its contract list share. */

export function CheckMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-mute transition-colors hover:bg-surface hover:text-foreground"
    >
      {copied ? (
        <CheckMark />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function ExplorerLink({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-mute transition-colors hover:bg-surface hover:text-foreground"
    >
      Explorer <ArrowUpRight />
    </a>
  );
}
