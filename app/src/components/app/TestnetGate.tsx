"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  isTestnetOpen,
  msUntilTestnetOpen,
  testnetEarlyKey,
  testnetOpensAtMs,
} from "@/lib/testnetLaunch";
import { Logo } from "@/components/Logo";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function splitCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const d = Math.floor(h / 24);
  return { d, h: h % 24, m, s, totalSec };
}

export function TestnetGate({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const earlyKey = testnetEarlyKey();
  const earlyOk =
    Boolean(earlyKey) && search.get("early") === earlyKey;

  const [now, setNow] = useState(() => Date.now());
  const open = earlyOk || isTestnetOpen(now);
  const remaining = msUntilTestnetOpen(now);
  const parts = useMemo(() => splitCountdown(remaining), [remaining]);

  useEffect(() => {
    if (open) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    void import("@/lib/track").then(({ track }) => {
      track(open ? "testnet_open" : "testnet_gate_view");
    });
  }, [open]);

  // Auto-reload once when the clock hits open so nested state is clean
  useEffect(() => {
    if (open) return;
    if (remaining > 0 && remaining < 500) {
      const t = window.setTimeout(() => window.location.reload(), remaining + 50);
      return () => window.clearTimeout(t);
    }
  }, [open, remaining]);

  if (open) return <>{children}</>;

  const opensLabel = new Date(testnetOpensAtMs()).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5 sm:h-16 sm:px-8">
          <Logo />
          <span className="rounded-full border border-lime/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            Opens soon
          </span>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
        >
          <div className="absolute left-1/2 top-1/3 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-lime/[0.06] blur-[90px]" />
        </div>

        <div className="relative w-full max-w-lg text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">
            Public testnet
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            Public testnet unlocks soon
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-mute">
            Shield, private pay, and private trade on Robinhood Chain. The app
            opens automatically when the timer hits zero.
          </p>
          <p className="mt-2 font-mono text-[11px] text-mute">
            Target · {opensLabel}
          </p>

          <div
            className="mt-10 grid grid-cols-4 gap-2 sm:gap-3"
            role="timer"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Opens in ${parts.d} days ${parts.h} hours ${parts.m} minutes ${parts.s} seconds`}
          >
            {(
              [
                ["Days", parts.d],
                ["Hours", parts.h],
                ["Mins", parts.m],
                ["Secs", parts.s],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-line bg-panel px-2 py-4 sm:px-3"
              >
                <p className="tnum font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                  {pad(value)}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-mute">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              Read the docs
            </Link>
            <Link
              href="/whitepaper"
              className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
            >
              Whitepaper
            </Link>
            <a
              href="https://x.com/gloamtrade"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center px-2 text-sm text-mute underline-offset-4 hover:text-foreground hover:underline"
            >
              @gloamtrade
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
