"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useMemes } from "@/hooks/useMemes";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatMark, formatUsd } from "@/lib/markets";
import { NetworkPulse } from "./NetworkPulse";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";

type Filter = "all" | "onchain" | "stocks" | "memes";

function formatVol(n: number) {
  if (!n || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function MarketsView() {
  const { settings } = useTradingSettings();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Filter>("all");
  const { data, isFetching, isError, refetch } = useLiveMarkets();
  const {
    data: memeData,
    isFetching: memeFetching,
    isError: memeError,
    refetch: refetchMemes,
  } = useMemes();

  const markets = data?.markets ?? [];
  const memes = memeData?.memes ?? [];
  const liveCount = data?.meta?.liveCount ?? 0;
  const showType = kind === "all";

  const stockRows = useMemo(() => {
    return markets.filter((m) => {
      if (kind === "onchain" && !m.address) return false;
      if (kind === "stocks" && m.kind !== "stock") return false;
      if (kind === "memes") return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(s) ||
        m.name.toLowerCase().includes(s)
      );
    });
  }, [q, kind, markets]);

  const memeRows = useMemo(() => {
    if (kind !== "memes" && kind !== "all") return [];
    return memes.filter((m) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(s) ||
        m.name.toLowerCase().includes(s)
      );
    });
  }, [q, kind, memes]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "onchain", label: "Onchain" },
    { id: "stocks", label: "Stocks" },
    { id: "memes", label: "Memes" },
  ];

  const gridHead = showType
    ? "sm:grid-cols-[1.2fr_0.7fr_1fr_1fr_0.8fr_auto]"
    : "sm:grid-cols-[1.4fr_1.1fr_1fr_0.8fr_auto]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkPulse />
        <p className="text-xs text-mute">
          {kind === "memes" ? (
            memeError ? (
              <button
                type="button"
                onClick={() => void refetchMemes()}
                className="text-lime hover:underline"
              >
                Retry memes
              </button>
            ) : memeFetching ? (
              "Loading memes…"
            ) : (
              `${memes.length} on RH mainnet`
            )
          ) : isError ? (
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

      {kind === "memes" && (
        <p className="text-xs text-mute">
          Robinhood <strong className="text-foreground">mainnet</strong> pairs
          via DexScreener. Testnet faucet stocks live under Onchain.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div
          className={`hidden gap-4 border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:grid ${gridHead}`}
        >
          <span>Market</span>
          {showType && <span>Type</span>}
          <span>{kind === "memes" ? "Vol 24h" : "Chart"}</span>
          <span>Price</span>
          <span>24h</span>
          <span />
        </div>

        {/* Stocks / onchain */}
        {kind !== "memes" && (
          <ul>
            {stockRows.map((m) => (
              <li
                key={m.id}
                className={`grid gap-2 border-b border-line px-4 py-4 last:border-0 sm:items-center sm:gap-4 ${gridHead}`}
              >
                <div>
                  <p className="font-medium text-foreground">{m.symbol}</p>
                  <p className="text-xs text-mute">{m.name}</p>
                </div>
                {showType && (
                  <div>
                    {m.address ? (
                      <StatusPill tone="lime">Onchain</StatusPill>
                    ) : m.kind === "native" ? (
                      <StatusPill>Gas</StatusPill>
                    ) : (
                      <StatusPill>Watch</StatusPill>
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
                <p className="font-mono text-sm text-foreground">
                  {settings.showUsd
                    ? formatUsd(m.mark)
                    : `$${formatMark(m.mark)}`}
                </p>
                <p
                  className={`text-sm ${
                    m.change24h >= 0
                      ? "text-[var(--chart-up)]"
                      : "text-[var(--chart-down)]"
                  }`}
                >
                  {m.change24h >= 0 ? "+" : ""}
                  {m.change24h}%
                </p>
                <Link
                  href={`/app/trade?market=${m.id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-3 text-sm text-foreground hover:border-lime/50 sm:justify-self-end"
                >
                  Trade
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Memes from DexScreener RH mainnet */}
        {(kind === "memes" || kind === "all") && memeRows.length > 0 && (
          <ul>
            {kind === "all" && (
              <li className="border-b border-line bg-background/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Memes · RH mainnet
              </li>
            )}
            {memeRows.map((m) => (
              <li
                key={m.id}
                className={`grid gap-2 border-b border-line px-4 py-4 last:border-0 sm:items-center sm:gap-4 ${gridHead}`}
              >
                <div>
                  <p className="font-medium text-foreground">{m.symbol}</p>
                  <p className="truncate text-xs text-mute">{m.name}</p>
                </div>
                {showType && (
                  <div>
                    <StatusPill>Meme</StatusPill>
                  </div>
                )}
                <p className="font-mono text-sm text-mute">
                  {formatVol(m.volume24h)}
                </p>
                <p className="font-mono text-sm text-foreground">
                  {m.priceUsd < 0.01
                    ? `$${m.priceUsd.toPrecision(3)}`
                    : formatUsd(m.priceUsd)}
                </p>
                <p
                  className={`text-sm ${
                    m.change24h >= 0
                      ? "text-[var(--chart-up)]"
                      : "text-[var(--chart-down)]"
                  }`}
                >
                  {m.change24h >= 0 ? "+" : ""}
                  {m.change24h}%
                </p>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-3 text-sm text-foreground hover:border-lime/50 sm:justify-self-end"
                >
                  Chart
                </a>
              </li>
            ))}
          </ul>
        )}

        {kind !== "memes" && stockRows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-mute">
            No markets match.
          </p>
        )}
        {kind === "memes" && memeRows.length === 0 && !memeFetching && (
          <p className="px-4 py-10 text-center text-sm text-mute">
            No memes loaded. Retry in a moment.
          </p>
        )}
      </div>
    </div>
  );
}
