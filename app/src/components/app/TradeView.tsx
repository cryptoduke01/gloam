"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { MARKETS, formatMark, type Market } from "@/lib/markets";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

export function TradeView() {
  const { isConnected } = useAccount();
  const search = useSearchParams();
  const initial =
    MARKETS.find((m) => m.id === search.get("market"))?.id ?? MARKETS[0].id;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [marketId, setMarketId] = useState(initial);
  const [amount, setAmount] = useState("");
  const [filter, setFilter] = useState<"all" | "stock" | "meme">("all");
  const [note, setNote] = useState<string | null>(null);

  const market = useMemo(
    () => MARKETS.find((m) => m.id === marketId) ?? MARKETS[0],
    [marketId]
  );

  const list = useMemo(() => {
    if (filter === "all") return MARKETS;
    return MARKETS.filter((m) => m.kind === filter);
  }, [filter]);

  function onTrade(e: React.FormEvent) {
    e.preventDefault();
    setNote(
      `Private ${side} for ${market.symbol} is not live. No order was placed, no fill was faked. Public pools come next; private execution after shield.`
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Market list */}
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
        <ul className="max-h-[28rem] overflow-y-auto">
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setMarketId(m.id)}
                className={`flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${
                  m.id === marketId
                    ? "bg-background"
                    : "hover:bg-background/60"
                }`}
              >
                <div>
                  <p className="font-medium text-foreground">{m.symbol}</p>
                  <p className="text-xs text-mute">
                    {m.name} · {m.kind}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-foreground">
                    {formatMark(m)}
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
        <p className="border-t border-line px-4 py-2 text-[11px] text-mute">
          Marks are UI scaffolding — not live oracle prices.
        </p>
      </div>

      {/* Ticket */}
      <div className="lg:col-span-5">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-28 border-b border-line">
            <AsciiImage
              src="/ascii/trade.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="40vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
              <div>
                <StatusPill tone="warn">Private book pending</StatusPill>
                <p className="mt-1 font-display text-2xl text-foreground">
                  {market.symbol}
                </p>
              </div>
              <p className="font-mono text-sm text-mute">
                {formatMark(market)}
              </p>
            </div>
          </div>

          <form onSubmit={onTrade} className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2">
              <SideButton
                active={side === "buy"}
                onClick={() => setSide("buy")}
                label="Buy"
              />
              <SideButton
                active={side === "sell"}
                onClick={() => setSide("sell")}
                label="Sell"
                sell
              />
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

            <div className="rounded-md border border-line bg-background px-4 py-3 text-xs text-mute">
              Execution stays private until you unshield. Size is not free
              signal on a public AMM — when rails are live.
            </div>

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
                {side === "buy" ? "Buy" : "Sell"} {market.symbol} when live
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

      {/* Context */}
      <aside className="space-y-4 lg:col-span-3">
        <MarketCard market={market} />
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Thesis
          </p>
          <p className="mt-2 font-display text-lg text-foreground">
            Everything. Privately.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-mute">
            Stocks for size. Memes for urgency. One private venue on Robinhood
            Chain.
          </p>
        </div>
      </aside>
    </div>
  );
}

function SideButton({
  active,
  onClick,
  label,
  sell,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sell?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-md text-sm font-semibold transition-colors ${
        active
          ? sell
            ? "bg-foreground text-background"
            : "bg-lime text-black"
          : "border border-line text-mute hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MarketCard({ market }: { market: Market }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
        Selected
      </p>
      <p className="mt-2 text-lg font-medium text-foreground">{market.name}</p>
      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex justify-between">
          <dt className="text-mute">Kind</dt>
          <dd className="capitalize text-foreground">{market.kind}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Mark</dt>
          <dd className="font-mono text-foreground">{formatMark(market)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">24h vol</dt>
          <dd className="text-foreground">{market.volume}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Private</dt>
          <dd className="text-amber-500">Pending</dd>
        </div>
      </dl>
    </div>
  );
}
