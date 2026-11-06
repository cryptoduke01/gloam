"use client";

import { useState } from "react";
import { SealDots } from "@/components/ui/SealDots";
import { getNetwork } from "@/lib/networks";
import type { Activity, FeeSetting, Stats } from "./client";
import { ago, ArrowIcon, Card, fmtInt, fmtUnits, fmtUsd, fullDate, Kpi, LockIcon } from "./ui";
import { ArrowUpRight } from "@/components/ui/ArrowUpRight";
import { PartnerBreakdown, SOURCE_LABEL } from "@/components/partners/PartnerBreakdown";

const KIND_LABEL: Record<Activity["kind"], string> = {
  private_payment: "Private payment",
  cash_out: "Cash out",
  deposit: "Deposit",
  private_swap: "Private swap",
};

function fmtDay(day: string, long = false): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: long ? "short" : undefined,
    timeZone: "UTC",
  });
}

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/**
 * Payments per day: one series in ink, no legend (the card title names it).
 * Hovering or focusing a bar shows that day's breakdown beside it, inside the
 * plot, on the side away from the bar.
 */
function DailyBars({ daily }: { daily: Stats["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = daily.map((d) => d.privatePayments + d.cashOuts + d.deposits + d.swaps);
  const max = Math.max(1, ...totals);
  const n = daily.length;
  const d = hover != null ? daily[hover] : null;
  const side =
    hover == null
      ? undefined
      : hover < n / 2
        ? { left: `calc(${((hover + 1) / n) * 100}% + 6px)` }
        : { right: `calc(${(1 - hover / n) * 100}% + 6px)` };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-mute">
        <span className="tnum">{fmtInt(max)} a day at most</span>
        <span className="tnum">{fmtInt(totals.reduce((a, b) => a + b, 0))} in 14 days</span>
      </div>
      <div className="relative mt-3 h-[148px] border-b border-line" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {daily.map((day, i) => {
            const t = totals[i]!;
            const pct = (t / max) * 100;
            return (
              <button
                key={day.day}
                type="button"
                aria-label={`${fmtDay(day.day, true)}: ${plural(day.privatePayments, "private payment", "private payments")}, ${plural(day.cashOuts, "cash out", "cash outs")}, ${plural(day.deposits, "deposit", "deposits")}, ${plural(day.swaps, "private swap", "private swaps")}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-[4px] outline-none focus-visible:bg-surface"
              >
                <span
                  className={`block w-full max-w-[28px] rounded-t-[4px] transition-colors ${
                    hover === i ? "bg-foreground" : "bg-foreground/70"
                  }`}
                  style={{ height: t > 0 ? `max(${pct}%, 3px)` : "0px" }}
                />
              </button>
            );
          })}
        </div>
        {d && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[200px] rounded-xl border border-line bg-panel px-3 py-2 text-[12px] leading-relaxed text-soft shadow-pop"
            style={side}
          >
            <span className="block text-foreground">{fmtDay(d.day, true)}</span>
            <span className="block">{plural(d.privatePayments, "private payment", "private payments")}</span>
            <span className="block">
              {plural(d.cashOuts, "cash out", "cash outs")}, {plural(d.deposits, "deposit", "deposits")}
            </span>
            {d.swaps > 0 && <span className="block">{plural(d.swaps, "private swap", "private swaps")}</span>}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-mute">
        <span>{daily[0] ? fmtDay(daily[0].day) : ""}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: Activity["kind"] }) {
  const sealed = kind === "private_payment";
  return (
    <span
      aria-hidden
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${sealed ? "bg-sealed-soft text-sealed" : "bg-surface text-soft"}`}
    >
      {sealed ? <LockIcon size={13} /> : <ArrowIcon dir={kind === "cash_out" || kind === "private_swap" ? "out" : "in"} />}
    </span>
  );
}

function ActivityList({ items }: { items: Activity[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const net = getNetwork(a.network);
        const pub = a.kind !== "private_payment";
        return (
          <li key={a.id} className="flex min-h-[68px] items-center gap-2.5 px-4 py-2.5 sm:gap-3 sm:px-6">
            <KindBadge kind={a.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] text-foreground">{KIND_LABEL[a.kind]}</span>
              <span className="block truncate text-[12.5px] text-mute">
                {SOURCE_LABEL[a.source ?? "api"]} · {net.label} ·{" "}
                <time dateTime={new Date(a.ts).toISOString()} title={fullDate(a.ts)}>
                  {ago(a.ts)}
                </time>
              </span>
            </span>
            <span className="tnum hidden w-[150px] shrink-0 text-right text-[14px] sm:block">
              {pub ? (
                <span className="text-foreground">
                  {fmtUnits(a.amount, a.decimals)} <span className="text-mute">{a.symbol ?? ""}</span>
                </span>
              ) : (
                <span className="inline-flex items-center justify-end gap-2 text-mute">
                  <SealDots n={5} className="text-sealed" label="Amount hidden" />
                  <span className="text-[12px]">Hidden</span>
                </span>
              )}
            </span>
            <a
              href={net.explorerTx(a.txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label={`View this ${KIND_LABEL[a.kind].toLowerCase()} on the explorer`}
              className="-mr-2 grid h-10 w-8 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-surface hover:text-foreground sm:w-10"
            >
              <ArrowUpRight />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Mainnet or testnet: the two are never added together. */
function TierSwitch({ tier, onTier }: { tier: "mainnet" | "testnet"; onTier: (t: "mainnet" | "testnet") => void }) {
  return (
    <div role="radiogroup" aria-label="Network" className="inline-flex rounded-full bg-surface-2 p-1 text-[13px]">
      {(["mainnet", "testnet"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tier === t}
          onClick={() => onTier(t)}
          className={`h-8 rounded-full px-3.5 transition-colors ${tier === t ? "bg-panel font-medium text-foreground shadow-card" : "text-mute hover:text-foreground"}`}
        >
          {t === "mainnet" ? "Mainnet" : "Testnet"}
        </button>
      ))}
    </div>
  );
}

export function Overview({
  stats,
  fees,
  activeKeys,
  loading,
  onQuickstart,
  tier,
  onTier,
}: {
  stats: Stats | null;
  fees: FeeSetting;
  activeKeys: number;
  loading: boolean;
  onQuickstart: () => void;
  tier: "mainnet" | "testnet";
  onTier: (t: "mainnet" | "testnet") => void;
}) {
  if (!stats) {
    return (
      <div aria-busy="true" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="gl-card h-[118px] motion-safe:animate-pulse" />
          ))}
        </div>
        <div className="gl-card h-[280px] motion-safe:animate-pulse" />
        {!loading && <p className="text-[13px] text-mute">Could not load your figures.</p>}
      </div>
    );
  }
  const t = stats.totals;
  const publicCount = t.cashOuts + t.deposits;
  const testnet = stats.tier === "testnet";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TierSwitch tier={tier} onTier={onTier} />
        <p className="text-[12.5px] text-mute">{testnet ? "Testnet figures: counted, never valued in dollars." : "Mainnet figures. Testnet is counted apart."}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Private payments" value={fmtInt(t.privatePayments)} sub="days that have ended (UTC), amounts hidden" />
        <Kpi
          label="Public volume"
          value={testnet ? "Not priced" : fmtUsd(t.publicVolumeUsd)}
          sub={`${fmtInt(publicCount)} cash outs and deposits${!testnet && t.unpriced ? `, ${t.unpriced} unpriced` : ""}`}
        />
        <Kpi
          label="Fees charged"
          value={testnet ? fmtInt(stats.feesCharged?.count ?? 0) : fmtUsd(stats.feesCharged?.usd ?? 0)}
          sub={testnet ? "testnet fees, counted, not valued" : `${fmtInt(stats.feesCharged?.count ?? 0)} fees, as reported`}
        />
        <Kpi label="Active keys" value={fmtInt(activeKeys)} sub={stats.lastActivity ? `last cash out, deposit or swap ${ago(stats.lastActivity)}` : "nothing public yet"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Payments per day" action={<span className="text-[12.5px] text-mute">Last 14 days, UTC</span>}>
          <DailyBars daily={stats.daily} />
        </Card>
        <Card
          title="Your fee, right now"
          flush
          foot="Your users pay it on top, as one private payment to your Gloam address. Set it and your addresses in Settings."
        >
          <ul className="divide-y divide-line">
            {(
              [
                // Totals cover every network, mainnets included once their pools are in.
                ["Private payment", `$${(fees.privatePaymentCents / 100).toFixed(2)} each`, t.privatePayments, true],
                ["Cash out", `${(fees.cashoutBps / 100).toFixed(2)}%`, t.cashOuts, false],
                ["Deposit", `${(fees.depositBps / 100).toFixed(2)}%`, t.deposits, false],
                ["Private swap", "No fee", t.privateSwaps, false],
              ] as const
            ).map(([k, v, n, sealed]) => (
              <li key={k} className="flex min-h-[56px] items-center justify-between gap-3 px-5 sm:px-6">
                <span className="flex items-center gap-2.5 text-[14px] text-foreground">
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 place-items-center rounded-full ${sealed ? "bg-sealed-soft text-sealed" : "bg-surface text-soft"}`}
                  >
                    {sealed ? <LockIcon size={10} /> : <ArrowIcon dir={k === "Deposit" ? "in" : "out"} />}
                  </span>
                  {k}
                </span>
                <span className="tnum text-right text-[14px] text-foreground">
                  {v}
                  <span className="block text-[12px] text-mute">{fmtInt(n)} so far</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Recent cash outs, deposits and swaps"
        flush
        action={<span className="text-[12.5px] text-mute">{loading ? "Checking…" : "Updates every 20 seconds"}</span>}
        foot="Cash outs, deposits and swaps are public on chain, so they are listed with their transaction. Private payments are never listed one by one, and are counted only once their day (UTC) has ended, so no hidden payment can be tied to an invoice, a link or a moment. Fees arrive in your Gloam app as private payments."
      >
        {stats.recent.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-6">
            <p className="text-[15px] text-foreground">Nothing listed yet</p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-mute">
              Relay a payment with one of your keys, or share a link with your link code, and it shows up here once it lands.
            </p>
            <button type="button" onClick={onQuickstart} className="btn btn-ghost btn-sm mt-5">
              See the quickstart
            </button>
          </div>
        ) : (
          <ActivityList items={stats.recent} />
        )}
      </Card>

      <PartnerBreakdown
        stats={stats}
        days={stats.days ?? 14}
        notMatched={stats.notMatched}
        csv={{ daily: "/api/partners/export?type=daily", transactions: "/api/partners/export?type=transactions" }}
      />

      {(stats.feesCharged?.byToken.length ?? 0) > 0 && (
        <Card
          title="Fees charged by token"
          flush
          foot="Each fee is counted once its private payment to you landed, with the amount your user's app reported: a private payment's amount is hidden on chain. Fees arrive at your Gloam address and show in your Gloam app."
        >
          <div className="overflow-x-auto">
            <table className="tnum w-full text-left text-[14px]">
              <thead className="border-b border-line bg-surface">
                <tr>
                  {["Token", "Network", "On", "Fees", "Amount"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-[12.5px] font-medium text-mute sm:px-6 ${h === "Network" ? "max-sm:hidden" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.feesCharged.byToken.map((a) => (
                  <tr key={`${a.chainId}-${a.asset}-${a.kind}`} className="border-b border-line last:border-0">
                    <td className="h-[52px] px-4 text-foreground sm:px-6">
                      {a.symbol}
                      <span className="block text-[12px] text-mute sm:hidden">{getNetwork(a.network as never).label}</span>
                    </td>
                    <td className="px-4 text-soft max-sm:hidden sm:px-6">{getNetwork(a.network as never).label}</td>
                    <td className="px-4 text-soft sm:px-6">{KIND_LABEL[a.kind]}</td>
                    <td className="px-4 text-soft sm:px-6">{fmtInt(a.count)}</td>
                    <td className="px-4 text-foreground sm:px-6">
                      {Number(a.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                      {a.usd != null && <span className="block text-[12px] text-mute">{fmtUsd(a.usd)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
