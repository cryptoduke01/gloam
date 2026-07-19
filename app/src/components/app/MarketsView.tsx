"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatMark, formatUsd } from "@/lib/markets";
import { NetworkPulse } from "./NetworkPulse";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";

type Filter = "all" | "onchain" | "private" | "stocks";

/** Testnet-only markets. No mainnet memes mixed in. */
export function MarketsView() {
  const { settings } = useTradingSettings();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Filter>("private");
  const { data, isFetching, isError, refetch } = useLiveMarkets();
  const markets = data?.markets ?? [];
  const liveCount = data?.meta?.liveCount ?? 0;
  const showType = kind === "all" || kind === "private";

  const rows = useMemo(() => {
    return markets.filter((m) => {
      if (kind === "onchain" && !m.address) return false;
      if (kind === "private" && !m.privateReady) return false;
      if (kind === "stocks" && m.kind !== "stock") return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(s) ||
        m.name.toLowerCase().includes(s)
      );
    });
  }, [q, kind, markets]);

  const filters: { id: Filter; label: string }[] = [
    { id: "private", label: "Private" },
    { id: "onchain", label: "Onchain" },
    { id: "all", label: "All" },
    { id: "stocks", label: "Stocks" },
  ];

  const grid = showType
    ? "sm:grid-cols-[1.2fr_0.7fr_1fr_1fr_0.8fr_auto]"
    : "sm:grid-cols-[1.4fr_1.1fr_1fr_0.8fr_auto]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkPulse />
        <p className="text-xs text-mute">
          {isError ? (
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-lime hover:underline"
            >
              Retry
            </button>
          ) : isFetching ? (
            "Updating…"
          ) : liveCount > 0 ? (
            `${liveCount} live`
          ) : (
            "Waiting…"
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setKind(f.id)}
              className={`rounded-lg px-3 py-2 text-sm ${
                kind === f.id
                  ? "bg-lime text-black"
                  : "border border-line text-mute hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="min-h-11 w-full rounded-lg border border-line bg-panel px-4 text-sm text-foreground outline-none placeholder:text-mute focus:border-lime sm:max-w-xs"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div
          className={`hidden gap-4 border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:grid ${grid}`}
        >
          <span>Market</span>
          {showType && <span>Type</span>}
          <span>Chart</span>
          <span>Price</span>
          <span>24h</span>
          <span />
        </div>
        <ul>
          {rows.map((m) => (
            <li
              key={m.id}
              className={`grid gap-2 border-b border-line px-4 py-4 last:border-0 sm:items-center sm:gap-4 ${grid}`}
            >
              <div>
                <p className="font-medium text-foreground">{m.symbol}</p>
                <p className="text-xs text-mute">{m.name}</p>
              </div>
              {showType && (
                <div className="flex flex-wrap gap-1">
                  {m.address ? (
                    <StatusPill tone="lime">Onchain</StatusPill>
                  ) : m.kind === "native" ? (
                    <StatusPill>Gas</StatusPill>
                  ) : (
                    <StatusPill>Watch</StatusPill>
                  )}
                  {m.privateReady && (
                    <StatusPill tone="lime">Private</StatusPill>
                  )}
                </div>
              )}
              <Sparkline
                points={
                  m.spark && m.spark.length >= 2
                    ? m.spark
                    : m.mark > 0
                      ? [m.mark * 0.98, m.mark * 1.01, m.mark]
                      : []
                }
                up={m.change24h >= 0}
                width={88}
                height={32}
              />
              <p className="tnum font-mono text-sm text-foreground">
                {settings.showUsd
                  ? formatUsd(m.mark)
                  : `$${formatMark(m.mark)}`}
              </p>
              <p
                className={`tnum text-sm ${
                  m.change24h >= 0
                    ? "text-[var(--chart-up)]"
                    : "text-[var(--chart-down)]"
                }`}
              >
                {m.change24h >= 0 ? "+" : ""}
                {m.change24h}%
              </p>
              <Link
                href={
                  m.privateReady
                    ? `/app/trade?market=${m.id}&path=sealed`
                    : `/app/trade?market=${m.id}`
                }
                className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm sm:justify-self-end ${
                  m.privateReady
                    ? "bg-lime font-semibold text-black hover:opacity-90"
                    : "border border-line text-foreground hover:border-lime/50"
                }`}
              >
                {m.privateReady ? "Private" : "Trade"}
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-mute">
              No markets match.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
