"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  isTestnetOpen,
  msUntilTestnetOpen,
  testnetEarlyKey,
  testnetOpensAtMs,
} from "@/lib/testnetLaunch";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";

const ease = [0.22, 1, 0.36, 1] as const;

const DEMO_X_URL =
  "https://x.com/dukedotsol/status/2077117792520634789";

const plates = [
  {
    src: "/ascii/shield.png",
    title: "Shield",
    body: "Park assets in the vault. Your open wallet no longer shows that bag.",
  },
  {
    src: "/ascii/move.png",
    title: "Private pay",
    body: "Send inside the pool with a payment code — not a public transfer.",
  },
  {
    src: "/ascii/trade.png",
    title: "Trade",
    body: "Vault adapter today; sealed-size private trade on the roadmap.",
  },
] as const;

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

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

export function TestnetGate({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const reduce = useReducedMotion();
  const earlyKey = testnetEarlyKey();
  const earlyOk = Boolean(earlyKey) && search.get("early") === earlyKey;

  const [now, setNow] = useState(() => Date.now());
  const [activePlate, setActivePlate] = useState(0);
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

  useEffect(() => {
    if (open || reduce) return;
    const id = window.setInterval(() => {
      setActivePlate((i) => (i + 1) % plates.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [open, reduce]);

  useEffect(() => {
    if (open) return;
    if (remaining > 0 && remaining < 500) {
      const t = window.setTimeout(
        () => window.location.reload(),
        remaining + 50,
      );
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
      <Header />

      <main className="relative flex flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-lime/[0.06] blur-[110px]" />
          <div className="absolute -left-20 bottom-0 h-[280px] w-[280px] rounded-full bg-lime/[0.04] blur-[90px]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-16">
          {/* Left: copy + timer */}
          <motion.div
            className="flex flex-col justify-center lg:col-span-5"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                <span className="livedot h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_var(--lime)]" />
                Public testnet
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                RH · 46630
              </span>
            </div>

            <h1 className="mt-5 font-display text-[2.4rem] leading-[1.04] tracking-tight text-foreground sm:text-5xl lg:text-[3.1rem]">
              Unlocking private money on Robinhood
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-mute">
              Shield, private pay, cash out with ZK proofs — live when the clock
              hits zero. Prep with the guide so you&apos;re ready on open.
            </p>
            <p className="mt-2 font-mono text-[11px] text-mute">
              Opens · {opensLabel}
            </p>

            <div
              className="mt-8 grid grid-cols-4 gap-2"
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
                  className="rounded-xl border border-line bg-panel px-2 py-3.5 sm:px-3 sm:py-4"
                >
                  <p className="tnum font-display text-2xl tracking-tight text-foreground sm:text-3xl">
                    {pad(value)}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-mute">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/docs/testnet"
                className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
              >
                Testnet guide
              </Link>
              <a
                href={DEMO_X_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-foreground hover:border-mute"
              >
                <XIcon className="h-3.5 w-3.5" />
                Watch demo on X
              </a>
            </div>

            <a
              href="https://x.com/gloamtrade"
              target="_blank"
              rel="noreferrer"
              className="lift mt-6 flex items-start gap-3.5 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-lime/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-background text-foreground">
                <XIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                  Updates
                </span>
                <span className="mt-0.5 block text-sm font-medium text-foreground">
                  Look out for updates on X
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-mute">
                  Go-live pings and clips at{" "}
                  <span className="text-foreground">@gloamtrade</span>. Follow
                  so you don&apos;t miss unlock.
                </span>
              </span>
              <span className="ml-auto shrink-0 self-center text-lime">→</span>
            </a>
          </motion.div>

          {/* Right: hero dither frame — fills column height cleanly */}
          <motion.div
            className="flex min-h-0 flex-col lg:col-span-7"
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.06, ease }}
          >
            <div className="flex min-h-[min(62vh,560px)] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--lime)_12%,transparent)]">
              <div className="relative min-h-0 flex-1">
                {plates.map((p, i) => (
                  <div
                    key={p.src}
                    className={`absolute inset-0 transition-opacity duration-700 ${
                      i === activePlate ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <AsciiImage
                      src={p.src}
                      alt={p.title}
                      tone="plate"
                      fit="cover"
                      priority={i === 0}
                      className="h-full w-full"
                      sizes="(max-width: 1024px) 100vw, 55vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                        {String(i + 1).padStart(2, "0")} · Preview
                      </p>
                      <p className="mt-1 font-display text-2xl text-white sm:text-3xl">
                        {p.title}
                      </p>
                      <p className="mt-1 max-w-md text-sm text-white/70">
                        {p.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid shrink-0 grid-cols-3 divide-x divide-line border-t border-line">
                {plates.map((p, i) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => setActivePlate(i)}
                    className={`min-h-14 px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lime ${
                      i === activePlate
                        ? "bg-lime/10 text-foreground"
                        : "bg-background/50 text-mute hover:bg-panel hover:text-foreground"
                    }`}
                    aria-pressed={i === activePlate}
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-lime">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium">
                      {p.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-mute lg:text-left">
              Walkthrough in the{" "}
              <Link
                href="/docs/testnet"
                className="text-lime underline-offset-2 hover:underline"
              >
                testnet guide
              </Link>
              . Demo video on{" "}
              <a
                href={DEMO_X_URL}
                target="_blank"
                rel="noreferrer"
                className="text-lime underline-offset-2 hover:underline"
              >
                X
              </a>
              .
            </p>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
