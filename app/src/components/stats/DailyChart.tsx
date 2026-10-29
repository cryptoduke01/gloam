"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PublicDay } from "@/lib/publicStats";

/**
 * One bar per UTC day since launch: deposits, private transfers and cash-outs
 * added together, all mainnets. One series, so one ink colour and no legend.
 * The readout line above the bars names the day under the pointer (or the
 * focused one, with the arrow keys); it starts on the latest day. The same
 * numbers are in a table under it.
 */

const intFmt = new Intl.NumberFormat("en-US");

function dayLabel(day: string, withYear = false): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const totalOf = (d: PublicDay) => d.deposits + d.transfers + d.cashouts;

export function DailyChart({ days }: { days: PublicDay[] }) {
  const [active, setActive] = useState<number>(days.length - 1);
  const max = Math.max(1, ...days.map(totalOf));
  const d = days[active] ?? days[days.length - 1];

  function pick(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * days.length);
    setActive(Math.min(days.length - 1, Math.max(0, i)));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    let i = active;
    if (e.key === "ArrowLeft") i = active - 1;
    else if (e.key === "ArrowRight") i = active + 1;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = days.length - 1;
    else return;
    e.preventDefault();
    setActive(Math.min(days.length - 1, Math.max(0, i)));
  }

  if (!d) return null;

  return (
    <figure className="m-0">
      <p aria-live="polite" className="tnum flex min-h-[48px] flex-wrap items-baseline gap-x-5 gap-y-1 text-[14px] text-mute">
        <span className="text-foreground">{dayLabel(d.day, true)}</span>
        <span>
          <span className="text-foreground">{intFmt.format(d.deposits)}</span> deposits
        </span>
        <span>
          <span className="text-foreground">{intFmt.format(d.transfers)}</span> private transfers
        </span>
        <span>
          <span className="text-foreground">{intFmt.format(d.cashouts)}</span> cash-outs
        </span>
      </p>

      <div className="relative mt-4">
        <span className="tnum absolute right-0 top-0 -translate-y-full pb-1 text-[12px] text-mute">{intFmt.format(max)}</span>
        <div
          role="img"
          tabIndex={0}
          aria-label={`Activity per day since launch. Use the left and right arrow keys to read each day. Highest day: ${intFmt.format(max)}.`}
          onPointerMove={pick}
          onPointerDown={pick}
          onKeyDown={onKey}
          className="flex h-[180px] touch-pan-y items-end gap-[2px] border-b border-line-strong outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:h-[220px]"
        >
          {days.map((x, i) => {
            const t = totalOf(x);
            const h = t === 0 ? 0 : Math.max(2, (t / max) * 100);
            return (
              <div key={x.day} className="flex h-full min-w-0 flex-1 items-end">
                <div
                  className={`w-full rounded-t-[4px] transition-colors ${i === active ? "bg-foreground" : "bg-foreground/35"}`}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="tnum mt-2 flex justify-between text-[12px] text-mute">
          <span>{dayLabel(days[0]!.day)}</span>
          {days.length > 1 && <span>{dayLabel(days[days.length - 1]!.day)}</span>}
        </div>
      </div>

      <details className="group mt-6">
        <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[13.5px] text-mute transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="transition-transform group-open:rotate-90">
            <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Show every day as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="tnum w-full min-w-[420px] text-left text-[13.5px]">
            <caption className="sr-only">Deposits, private transfers and cash-outs per UTC day since launch</caption>
            <thead className="text-mute">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-normal">Day (UTC)</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Deposits</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Private transfers</th>
                <th scope="col" className="py-2 text-right font-normal">Cash-outs</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((x) => (
                <tr key={x.day} className="border-b border-line">
                  <th scope="row" className="py-2 pr-4 font-normal text-soft">{dayLabel(x.day, true)}</th>
                  <td className="py-2 pr-4 text-right">{intFmt.format(x.deposits)}</td>
                  <td className="py-2 pr-4 text-right">{intFmt.format(x.transfers)}</td>
                  <td className="py-2 text-right">{intFmt.format(x.cashouts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
