"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useLiveMarkets } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatMark, formatUsd } from "@/lib/markets";
import { ConnectButton } from "./ConnectButton";
import { NetworkPulse } from "./NetworkPulse";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import { StatusPill } from "./StatusPill";

export function TradeView() {
  const { isConnected } = useAccount();
  const search = useSearchParams();
  const { settings } = useTradingSettings();
  const { data, isFetching, isError, refetch, isFetched } = useLiveMarkets();
  const markets = data?.markets ?? [];
  const liveCount = data?.meta?.liveCount ?? 0;

  const initial =
    markets.find((m) => m.id === search.get("market"))?.id ??
    markets[0]?.id ??
    "tsla";
  const [side, setSide] = useState<"buy" | "sell">(settings.defaultSide);
  const [marketId, setMarketId] = useState(initial);
  const [amount, setAmount] = useState("");
  const [filter, setFilter] = useState<"all" | "stock" | "meme">(
    settings.marketFilter
  );
  const [note, setNote] = useState<string | null>(null);

  const resolvedId = markets.some((m) => m.id === marketId)
    ? marketId
    : markets[0]?.id ?? "hood";

  const market = useMemo(
    () => markets.find((m) => m.id === resolvedId) ?? markets[0],
    [markets, resolvedId]
  );

  const list = useMemo(() => {
    if (filter === "all") return markets;
    return markets.filter((m) => m.kind === filter);
  }, [filter, markets]);

  function onTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!market) return;
    setNote(
      `Trading ${market.symbol} privately is not open yet. Nothing was sent.`
    );
  }

  if (!isFetched && markets.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
        Loading markets…
      </div>
    );
  }

  if (!market) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
        No markets available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkPulse />
        <div className="flex items-center gap-3 text-xs text-mute">
          {isError ? (
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-lime hover:underline"
            >
              Retry prices
            </button>
          ) : (
            <span>
              {isFetching
                ? "Updating…"
                : liveCount > 0
                  ? "Live prices"
                  : "Prices offline"}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-line bg-panel lg:col-span-4">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Markets
            </p>
            <div className="flex gap-1">
              {(["all", "stock", "meme"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2 py-1 text-[11px] capitalize ${
                    filter === f
                      ? "bg-lime text-black"
                      : "text-mute hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-[32rem] overflow-y-auto">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMarketId(m.id)}
                  className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 ${
                    m.id === resolvedId
                      ? "bg-background"
                      : "hover:bg-background/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{m.symbol}</p>
                    <p className="truncate text-xs text-mute">{m.name}</p>
                  </div>
                  <Sparkline
                    points={m.spark ?? []}
                    up={m.change24h >= 0}
                    width={64}
                    height={28}
                  />
                  <div className="w-16 text-right">
                    <p className="font-mono text-sm text-foreground">
                      {formatMark(m.mark)}
                    </p>
                    <p
                      className={`text-xs ${
                        m.change24h >= 0 ? "text-lime" : "text-red-400"
                      }`}
                    >
                      {m.change24h >= 0 ? "+" : ""}
                      {m.change24h}%
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 lg:col-span-5">
          {!settings.compactCharts && (
            <PriceChart
              points={market.spark ?? []}
              mark={market.mark}
              change24h={market.change24h}
            />
          )}

          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-2xl text-foreground">
                    {market.symbol}
                  </p>
                  <p className="text-sm text-mute">{market.name}</p>
                </div>
                {market.source === "live" ? (
                  <StatusPill tone="lime">Live</StatusPill>
                ) : (
                  <StatusPill tone="warn">Offline</StatusPill>
                )}
              </div>
            </div>

            <form onSubmit={onTrade} className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("buy")}
                  className={`min-h-11 rounded-md text-sm font-semibold ${
                    side === "buy"
                      ? "bg-lime text-black"
                      : "border border-line text-mute"
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setSide("sell")}
                  className={`min-h-11 rounded-md text-sm font-semibold ${
                    side === "sell"
                      ? "bg-foreground text-background"
                      : "border border-line text-mute"
                  }`}
                >
                  Sell
                </button>
              </div>

              <div>
                <label
                  htmlFor="trade-amt"
                  className="text-sm font-medium text-foreground"
                >
                  Size
                </label>
                <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                  <input
                    id="trade-amt"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                  />
                  <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                    {market.symbol}
                  </span>
                </div>
              </div>

              <p className="text-xs text-mute">
                Private trading is not open on testnet yet. Prices update live;
                orders do not fill.
              </p>

              {!isConnected ? (
                <ConnectButton />
              ) : (
                <button
                  type="submit"
                  className={`inline-flex min-h-12 w-full items-center justify-center rounded-md text-sm font-semibold ${
                    side === "buy"
                      ? "bg-lime text-black hover:opacity-90"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {side === "buy" ? "Buy" : "Sell"} {market.symbol}
                </button>
              )}

              {note && (
                <p
                  role="status"
                  className="rounded-md border border-line bg-background px-4 py-3 text-sm text-mute"
                >
                  {note}
                </p>
              )}
            </form>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Stats
            </p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-mute">Type</dt>
                <dd className="capitalize text-foreground">{market.kind}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">24h volume</dt>
                <dd className="text-foreground">{market.volume}</dd>
              </div>
              {market.address && (
                <div className="flex justify-between">
                  <dt className="text-mute">Onchain</dt>
                  <dd className="text-lime">Testnet token</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-mute">Mark</dt>
                <dd className="text-foreground">
                  {settings.showUsd
                    ? formatUsd(market.mark)
                    : `$${formatMark(market.mark)}`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">Private</dt>
                <dd className="text-mute">Coming soon</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
