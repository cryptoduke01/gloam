"use client";

import { useId, type ReactNode } from "react";
import { formatMark } from "@/lib/markets";

/**
 * Price card for the trade screen: a large light price, the day's move as a
 * quiet chip, and an area chart in the theme's chart tokens. `header` and
 * `footer` are optional slots (market identity above, stats below).
 */
export function PriceChart({
  points,
  mark,
  change24h,
  header,
  footer,
}: {
  points: number[];
  mark: number;
  change24h: number;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const gid = useId();
  const up = change24h >= 0;
  const flat = change24h === 0;
  const stroke = up ? "var(--chart-up)" : "var(--chart-down)";
  const w = 560;
  const h = 176;
  const pad = 12;

  let path = "";
  let area = "";
  let last: readonly [number, number] | null = null;
  if (points.length >= 2) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const coords = points.map((p, i) => {
      const x = pad + (i / (points.length - 1)) * innerW;
      const y = pad + innerH - ((p - min) / range) * innerH;
      return [x, y] as const;
    });
    path = `M ${coords.map(([x, y]) => `${x},${y}`).join(" L ")}`;
    last = coords[coords.length - 1];
    const first = coords[0];
    area = `${path} L ${last[0]},${h - pad} L ${first[0]},${h - pad} Z`;
  }

  return (
    <div className="gl-card overflow-hidden">
      {header && <div className="px-5 pt-5">{header}</div>}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">Price</p>
            <p className="t-display-m tnum mt-2 text-foreground">
              ${formatMark(mark)}
            </p>
          </div>
          <p
            className={`tnum inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[13px] font-medium ${
              flat
                ? "bg-surface text-mute"
                : up
                  ? "bg-[color-mix(in_srgb,var(--chart-up)_12%,transparent)] text-[var(--chart-up)]"
                  : "bg-[color-mix(in_srgb,var(--chart-down)_12%,transparent)] text-[var(--chart-down)]"
            }`}
          >
            {up ? "+" : ""}
            {change24h.toFixed(2)}%
            <span className="ml-1.5 font-normal opacity-70">24h</span>
          </p>
        </div>
        <div className="-mx-1 mt-5">
          {points.length < 2 ? (
            <div className="flex h-44 items-center justify-center rounded-[14px] bg-surface text-[13px] text-mute">
              No chart data yet.
            </div>
          ) : (
            <div className="relative">
              <svg
                viewBox={`0 0 ${w} ${h}`}
                className="block h-44 w-full"
                preserveAspectRatio="none"
                role="img"
                aria-label="Price chart"
              >
                <defs>
                  <linearGradient id={`pc-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line
                  x1={pad}
                  y1={h - pad}
                  x2={w - pad}
                  y2={h - pad}
                  stroke="var(--line)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <path d={area} fill={`url(#pc-${gid})`} />
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {last && <EndDot x={last[0] / w} y={last[1] / h} color={stroke} />}
            </div>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}

/** The live end of the line, drawn in HTML so it stays round when the SVG
 * stretches to the card width. */
export function EndDot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        background: color,
        boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)`,
      }}
    />
  );
}
