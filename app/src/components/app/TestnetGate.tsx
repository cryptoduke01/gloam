"use client";

import Link from "next/link";
import { useReducedMotion } from "framer-motion";
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
import { SealedField } from "@/components/ui/SealedField";
import { SealDots } from "@/components/ui/SealDots";

const DEMO_X_URL =
  "https://x.com/dukedotsol/status/2077117792520634789";

const plates = [
  {
    title: "Shield",
    body: "Add money to your vault. Your public wallet stops showing it.",
    row: "Private balance",
    status: "Sealed",
  },
  {
    title: "Private pay",
    body: "Pay someone with a Gloam address, not a public transfer.",
    row: "To gloam:7a3f…34cd",
    status: "Paid",
  },
  {
    title: "Trade",
    body: "Private balances and payments today. Private trading is coming.",
    row: "TSLA, amount hidden",
    status: "Soon",
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

  const plate = plates[activePlate];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <Header />

      <main className="flex flex-1 flex-col">
        {/* Hero panel on the sealed field: headline, CTAs, countdown */}
        <section className="px-[16px] pt-2">
          <div className="gl-panel mx-auto w-full max-w-[1400px] px-[24px] py-[64px] sm:px-12 sm:py-24">
            <SealedField tone="full" drift />
            <div className="relative mx-auto max-w-[1100px]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="gl-glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-medium text-foreground">
                  <span className="livedot h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />
                  Public testnet
                </span>
                <span className="tnum text-[12px] text-mute">
                  Robinhood Chain testnet, chain 46630
                </span>
              </div>

              <h1 className="t-display-xl mt-8 max-w-[16ch] text-foreground">
                Private money on Robinhood Chain
              </h1>
              <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-soft">
                Shield, private send, private trade and cash out go live when
                the clock hits zero. Read the guide now so you are ready on day
                one.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                <Link href="/docs/testnet" className="btn btn-ink btn-lg">
                  Testnet guide
                </Link>
                <a
                  href={DEMO_X_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-lg"
                >
                  <XIcon className="h-3.5 w-3.5" />
                  Watch the demo
                </a>
              </div>

              <div className="mt-14">
                <p className="t-label">Opens in</p>
                <div
                  className="mt-3 grid max-w-[720px] grid-cols-4 gap-[8px] sm:gap-3"
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
                      className="gl-glass rounded-[18px] px-2 py-[20px] text-center sm:py-7"
                    >
                      <p className="tnum text-[40px] font-light leading-none tracking-[-0.03em] text-foreground sm:text-[56px]">
                        {pad(value)}
                      </p>
                      <p className="t-label mt-3">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[13px] text-mute">{opensLabel}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Preview: what opens on day one */}
        <section className="mx-auto w-full max-w-[1200px] px-[20px] py-[80px] sm:px-8 sm:py-28">
          <p className="t-label">Preview</p>
          <h2 className="t-display-l mt-3 max-w-[18ch] text-foreground">
            What opens on day one
          </h2>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div
              className="grid gap-1.5 self-start"
              role="tablist"
              aria-label="Preview"
            >
              {plates.map((p, i) => (
                <button
                  key={p.title}
                  type="button"
                  role="tab"
                  aria-selected={i === activePlate}
                  onClick={() => setActivePlate(i)}
                  className={`rounded-[18px] px-5 py-4 text-left transition-colors ${
                    i === activePlate
                      ? "bg-panel shadow-card ring-1 ring-line"
                      : "hover:bg-surface"
                  }`}
                >
                  <span
                    className={`block text-[16px] font-medium ${
                      i === activePlate ? "text-foreground" : "text-soft"
                    }`}
                  >
                    {p.title}
                  </span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-mute">
                    {p.body}
                  </span>
                </button>
              ))}
            </div>

            <div className="gl-panel flex min-h-[320px] items-center justify-center p-6 sm:p-10">
              <SealedField tone="full" />
              <div
                key={plate.title}
                className="gl-glass relative w-full max-w-[380px] p-5"
                role="tabpanel"
              >
                <p className="t-label">{plate.title}</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-panel px-4 py-3.5 shadow-card">
                  <span className="min-w-0 truncate text-[14px] text-foreground">
                    {plate.row}
                  </span>
                  <SealDots n={6} className="text-foreground" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="text-mute">Visible only to you</span>
                  <span
                    className={`inline-flex h-6 items-center rounded-full px-2.5 font-medium ${
                      plate.status === "Soon"
                        ? "bg-surface text-mute"
                        : "bg-sealed-soft text-sealed"
                    }`}
                  >
                    {plate.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <a
            href="https://x.com/gloamtrade"
            target="_blank"
            rel="noreferrer"
            className="gl-card lift mt-10 flex w-full max-w-[640px] items-center gap-4 p-5"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-foreground">
              <XIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[15px] font-medium text-foreground">
                Follow @gloamtrade for updates
              </span>
              <span className="mt-1 block text-[14px] leading-relaxed text-mute">
                Go-live pings and clips land there first.
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="shrink-0 text-mute"
            >
              <path
                d="M5 12h13M13 6.5 18.5 12 13 17.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}
