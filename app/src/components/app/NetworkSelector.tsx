"use client";

/**
 * Header network switch. Lists every Gloam network and lets the user pick the
 * active one. Live networks (Robinhood today) are selectable; `planned` ones
 * (Tempo until its pool deploys) render disabled with a "Soon" badge, so the
 * multichain roadmap is visible and honest without offering a chain that cannot
 * take writes yet. It auto-enables Tempo the moment `networks.ts` marks it live.
 */
import { useEffect, useRef, useState } from "react";
import { allNetworks, isNetworkWritable } from "@/lib/networks";
import { useNetwork } from "./NetworkProvider";

export function NetworkSelector() {
  const { network, setNetworkKey } = useNetwork();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nets = allNetworks();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dot =
    network.status === "live" ? "bg-lime" : "bg-mute";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs text-foreground transition-colors hover:border-lime/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        <span className="font-medium">{network.label}</span>
        <span className="text-mute" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Select network"
          className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-background/98 shadow-xl backdrop-blur-md"
        >
          {nets.map((n) => {
            const active = n.key === network.key;
            const writable = isNetworkWritable(n);
            return (
              <button
                key={n.key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={!writable}
                onClick={() => {
                  if (!writable) return;
                  setNetworkKey(n.key);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 border-b border-line/60 px-3 py-3 text-left last:border-b-0 transition-colors ${
                  writable
                    ? "hover:bg-panel"
                    : "cursor-not-allowed opacity-70"
                } ${active ? "bg-panel" : ""}`}
              >
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.status === "live" ? "bg-lime" : "bg-mute"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {n.label}
                    </span>
                    {n.status === "planned" && (
                      <span className="rounded-full border border-line px-1.5 py-px text-[9px] uppercase tracking-[0.12em] text-mute">
                        Soon
                      </span>
                    )}
                    {active && (
                      <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-lime">
                        Active
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-mute">
                    {n.note}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
