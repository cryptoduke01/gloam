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

      <main className="relative flex-1 overflow-hidden">
        {/* Background dither + grid */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <AsciiImage
            src="/ascii/hero.png"
            alt=""
            tone="plate"
            priority
            className="h-full min-h-[100%] w-full opacity-[0.22]"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/88 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/80" />
          <div className="absolute -right-20 top-24 h-[380px] w-[380px] rounded-full bg-lime/[0.07] blur-[100px]" />
          <div className="absolute -left-16 bottom-32 h-[260px] w-[260px] rounded-full bg-lime/[0.04] blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
            {/* Copy + timer */}
            <motion.div
              className="lg:col-span-6"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-lime backdrop-blur-sm">
                  <span className="livedot h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_var(--lime)]" />
                  Public testnet
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Robinhood Chain · 46630
                </span>
              </div>

              <h1 className="mt-5 font-display text-[2.35rem] leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
                Unlocking private money on Robinhood
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
                Shield balances, private pay, cash out with ZK proofs, and trade
                paths — live when the clock hits zero. Prep with the guide so
                you&apos;re ready on open.
              </p>
              <p className="mt-2 font-mono text-[11px] text-mute">
                Opens · {opensLabel}
              </p>

              <div
                className="mt-8 grid grid-cols-4 gap-2 sm:gap-3"
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
                  <motion.div
                    key={label}
                    className="lift rounded-xl border border-line bg-panel/95 px-2 py-4 backdrop-blur-sm sm:px-3"
                    whileHover={reduce ? undefined : { y: -2 }}
                  >
                    <p className="tnum font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                      {pad(value)}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-mute">
                      {label}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/docs/testnet"
                  className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                >
                  Testnet guide
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex min-h-11 items-center rounded-md border border-line bg-panel/80 px-5 text-sm font-medium text-foreground hover:border-mute"
                >
                  Docs
                </Link>
                <Link
                  href="/whitepaper"
                  className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
                >
                  Whitepaper
                </Link>
              </div>

              {/* X updates card */}
              <a
                href="https://x.com/gloamtrade"
                target="_blank"
                rel="noreferrer"
                className="lift mt-8 flex items-start gap-4 rounded-xl border border-line bg-panel/90 p-4 backdrop-blur-sm transition-colors hover:border-lime/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-background text-foreground">
                  <XIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                    Updates
                  </span>
                  <span className="mt-1 block text-sm font-medium text-foreground">
                    Look out for updates on X
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-mute">
                    Open announcements, demo clips, and go-live pings land first
                    at{" "}
                    <span className="text-foreground">@gloamtrade</span>. Follow
                    so you don&apos;t miss unlock.
                  </span>
                </span>
                <span className="ml-auto shrink-0 self-center font-mono text-xs text-lime">
                  →
                </span>
              </a>
            </motion.div>

            {/* Interactive dither plates */}
            <motion.div
              className="lg:col-span-6"
              initial={reduce ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.06, ease }}
            >
              <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--lime)_10%,transparent)]">
                <div className="relative aspect-[4/3] w-full border-b border-line">
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
                        priority={i === 0}
                        className="h-full w-full"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                          {String(i + 1).padStart(2, "0")} · Preview
                        </p>
                        <p className="mt-1 font-display text-2xl text-white">
                          {p.title}
                        </p>
                        <p className="mt-1 max-w-sm text-sm text-white/75">
                          {p.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 divide-x divide-line">
                  {plates.map((p, i) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => setActivePlate(i)}
                      className={`min-h-14 px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lime ${
                        i === activePlate
                          ? "bg-lime/10 text-foreground"
                          : "bg-background/40 text-mute hover:bg-panel hover:text-foreground"
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

              <p className="mt-4 text-center text-xs text-mute sm:text-left">
                Full walkthrough in the{" "}
                <Link
                  href="/docs/testnet"
                  className="text-lime underline-offset-2 hover:underline"
                >
                  testnet guide
                </Link>
                , including wallet setup, faucet, shield → pay → cash out.
              </p>
            </motion.div>
          </div>

          {/* Bottom strip of small dithers */}
          <div className="mt-14 grid gap-3 sm:grid-cols-3">
            {plates.map((p, i) => (
              <button
                key={`tile-${p.title}`}
                type="button"
                onClick={() => setActivePlate(i)}
                className="lift group overflow-hidden rounded-xl border border-line bg-panel text-left"
              >
                <div className="relative aspect-[16/9] w-full border-b border-line">
                  <AsciiImage
                    src={p.src}
                    alt=""
                    tone="plate"
                    className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                    sizes="33vw"
                  />
                </div>
                <div className="p-4">
                  <p className="font-display text-lg text-foreground">
                    {p.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-mute">
                    {p.body}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
