"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { formatMark } from "@/lib/markets";
import { NetworkPulse } from "./NetworkPulse";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";

export function MarketsView() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "stock" | "meme">("all");
  const { data, isFetching, isError, refetch } = useLiveMarkets();
  const markets = data?.markets ?? [];
  const liveCount = data?.meta?.liveCount ?? 0;

  const rows = useMemo(() => {
    return markets.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        m.symbol.toLowerCase().includes(s) ||
        m.name.toLowerCase().includes(s)
      );
    });
  }, [q, kind, markets]);

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
            "Live prices"
          ) : (
            "Waiting for prices…"
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {(["all", "stock", "meme"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setKind(f)}
              className={`rounded-md px-3 py-2 text-sm capitalize ${
                kind === f
                  ? "bg-lime text-black"
                  : "border border-line text-mute hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "stock" ? "Stocks" : "Memes"}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="mkt-search">
          Search markets
        </label>
        <input
          id="mkt-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="min-h-11 w-full rounded-md border border-line bg-panel px-4 text-sm text-foreground outline-none placeholder:text-mute focus:border-lime sm:max-w-xs"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="hidden grid-cols-[1.2fr_0.7fr_1fr_1fr_0.8fr_auto] gap-4 border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mute sm:grid">
          <span>Market</span>
          <span>Type</span>
          <span>Chart</span>
          <span>Price</span>
          <span>24h</span>
          <span />
        </div>
        <ul>
          {rows.map((m) => (
            <li
              key={m.id}
              className="grid gap-2 border-b border-line px-4 py-4 last:border-0 sm:grid-cols-[1.2fr_0.7fr_1fr_1fr_0.8fr_auto] sm:items-center sm:gap-4"
            >
              <div>
                <p className="font-medium text-foreground">{m.symbol}</p>
                <p className="text-xs text-mute">{m.name}</p>
              </div>
              <div>
                <StatusPill>{m.kind}</StatusPill>
              </div>
              <Sparkline
                points={m.spark ?? []}
                up={m.change24h >= 0}
                width={88}
                height={32}
              />
              <p className="font-mono text-sm text-foreground">
                {formatMark(m.mark)}
              </p>
              <p
                className={`text-sm ${
                  m.change24h >= 0 ? "text-lime" : "text-red-400"
                }`}
              >
                {m.change24h >= 0 ? "+" : ""}
                {m.change24h}%
              </p>
              <Link
                href={`/app/trade?market=${m.id}`}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line px-3 text-sm text-foreground hover:border-lime/50 sm:justify-self-end"
              >
                Trade
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
