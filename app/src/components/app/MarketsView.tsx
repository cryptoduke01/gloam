"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatMark, formatUsd } from "@/lib/markets";
import { useNetwork } from "./NetworkProvider";
import { Sparkline } from "./Sparkline";
import { TokenLogo } from "./TokenLogo";
import { MarketChart } from "./MarketChart";

type Filter = "all" | "onchain" | "private" | "stocks";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "private", label: "Private-ready", hint: "Can be shielded and traded privately" },
  { id: "onchain", label: "Onchain", hint: "Live as a token on Robinhood Chain" },
  { id: "stocks", label: "Stocks", hint: "Tokenized equities" },
  { id: "all", label: "All markets", hint: "Everything on the watchlist" },
];

/** Testnet-only markets. No mainnet memes mixed in. */
export function MarketsView() {
  const { network } = useNetwork();
  const router = useRouter();
  // Tokenized stock marks are a Robinhood Chain product; Tempo is stablecoin
  // payments, with no equities to list or trade. On Tempo there is no Markets
  // page at all — send anyone who lands here back to the portfolio.
  const isTempo = network.key === "tempo";
  useEffect(() => {
    if (isTempo) router.replace("/app");
  }, [isTempo, router]);

  const { settings } = useTradingSettings();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Filter>("private");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, isFetching, isError, refetch } = useLiveMarkets();
  const markets = data?.markets ?? [];

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const rows = useMemo(() => {
    return markets.filter((m) => {
      if (kind === "onchain" && !m.address) return false;
      if (kind === "private" && !m.privateReady) return false;
      if (kind === "stocks" && m.kind !== "stock") return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)
      );
    });
  }, [q, kind, markets]);

  const activeFilter = FILTERS.find((f) => f.id === kind) ?? FILTERS[0];

  if (isTempo) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center text-sm text-mute">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* control bar: filter dropdown + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3.5 text-sm text-foreground transition-colors hover:border-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <span className="text-mute">Show</span>
            <span className="font-medium">{activeFilter.label}</span>
            <span className="text-mute" aria-hidden>
              {menuOpen ? "▴" : "▾"}
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-background shadow-xl"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={f.id === kind}
                  onClick={() => {
                    setKind(f.id);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-line/60 px-3.5 py-2.5 text-left last:border-b-0 transition-colors hover:bg-panel ${
                    f.id === kind ? "bg-panel" : ""
                  }`}
                >
                  <span className="flex w-full items-center justify-between text-sm font-medium text-foreground">
                    {f.label}
                    {f.id === kind && (
                      <span className="text-sealed" aria-hidden>
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-mute">{f.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-4 text-sm text-foreground outline-none placeholder:text-mute focus:border-mute sm:max-w-xs"
        />
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-10 rounded-lg border border-line px-3 text-sm text-foreground hover:border-mute"
          >
            Retry
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <ul>
          {rows.map((m) => {
            const open = expanded === m.id;
            const spark =
              m.spark && m.spark.length >= 2
                ? m.spark
                : m.mark > 0
                  ? [m.mark * 0.98, m.mark * 1.01, m.mark]
                  : [];
            const tradeHref = m.privateReady
              ? `/app/trade?market=${m.id}&path=sealed`
              : `/app/trade?market=${m.id}`;
            return (
              <li key={m.id} className="border-b border-line last:border-0">
                {/* whole row is the trade action; the chart toggle sits above it */}
                <div className="group relative transition-colors hover:bg-foreground/[0.02]">
                  <Link
                    href={tradeHref}
                    className="absolute inset-0 z-0"
                    aria-label={`Open ${m.symbol} to trade`}
                  />
                  <div className="pointer-events-none relative z-[1] grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[auto_1.3fr_1fr_0.9fr_0.7fr_auto] sm:gap-4">
                    <TokenLogo id={m.id} symbol={m.symbol} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{m.symbol}</p>
                      <p className="truncate text-xs text-mute">{m.name}</p>
                    </div>
                    <div className="hidden sm:block">
                      <Sparkline
                        points={spark}
                        up={m.change24h >= 0}
                        width={88}
                        height={32}
                      />
                    </div>
                    <p className="tnum hidden text-sm text-foreground sm:block">
                      {settings.showUsd
                        ? formatUsd(m.mark)
                        : `$${formatMark(m.mark)}`}
                    </p>
                    <p
                      className={`tnum hidden text-sm sm:block ${
                        m.change24h >= 0
                          ? "text-[var(--chart-up)]"
                          : "text-[var(--chart-down)]"
                      }`}
                    >
                      {m.change24h >= 0 ? "+" : ""}
                      {m.change24h}%
                    </p>
                    <div className="flex items-center gap-2 justify-self-end">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : m.id)}
                        className={`pointer-events-auto relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                          open
                            ? "border-foreground/30 bg-foreground/[0.04] text-foreground"
                            : "border-line text-mute hover:border-mute hover:text-foreground"
                        }`}
                        aria-label={open ? "Hide chart" : "Show chart"}
                        aria-expanded={open}
                      >
                        <ChartIcon />
                      </button>
                      <span className="hidden text-xs font-medium text-mute transition-colors group-hover:text-foreground sm:inline">
                        Trade
                      </span>
                      <ChevronIcon className="text-mute transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>

                  {/* price + 24h on mobile, under the row */}
                  <div className="pointer-events-none relative z-[1] flex items-center gap-3 px-4 pb-3 text-sm sm:hidden">
                    <span className="tnum text-foreground">
                      {settings.showUsd
                        ? formatUsd(m.mark)
                        : `$${formatMark(m.mark)}`}
                    </span>
                    <span
                      className={`tnum ${
                        m.change24h >= 0
                          ? "text-[var(--chart-up)]"
                          : "text-[var(--chart-down)]"
                      }`}
                    >
                      {m.change24h >= 0 ? "+" : ""}
                      {m.change24h}%
                    </span>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-line bg-background/40 px-4 py-4">
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {m.symbol}{" "}
                        <span className="text-mute">· {m.name}</span>
                      </p>
                      <p className="tnum text-sm text-foreground">
                        {settings.showUsd
                          ? formatUsd(m.mark)
                          : `$${formatMark(m.mark)}`}
                      </p>
                    </div>
                    <MarketChart points={spark} up={m.change24h >= 0} />
                  </div>
                )}
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-mute">
              {isFetching ? "Loading markets…" : "No markets match."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19V5m0 14h16M8 15l3.5-4 3 2.5L20 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
