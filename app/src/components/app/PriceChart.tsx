"use client";

import { formatMark } from "@/lib/markets";

export function PriceChart({
  points,
  mark,
  change24h,
}: {
  points: number[];
  mark: number;
  change24h: number;
}) {
  const up = change24h >= 0;
  const stroke = up ? "var(--chart-up)" : "var(--chart-down)";
  const w = 560;
  const h = 160;
  const pad = 12;

  let path = "";
  let area = "";
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
    const last = coords[coords.length - 1];
    const first = coords[0];
    area = `${path} L ${last[0]},${h - pad} L ${first[0]},${h - pad} Z`;
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
            Price
          </p>
          <p className="mt-1 font-display text-3xl text-foreground">
            ${formatMark(mark)}
          </p>
        </div>
        <p
          className={`rounded-full px-2.5 py-1 text-sm font-medium ${
            up
              ? "bg-[color-mix(in_srgb,var(--chart-up)_18%,transparent)] text-[var(--chart-up)]"
              : "bg-[color-mix(in_srgb,var(--chart-down)_15%,transparent)] text-[var(--chart-down)]"
          }`}
        >
          {up ? "+" : ""}
          {change24h}%
        </p>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg bg-background/60 p-1">
        {points.length < 2 ? (
          <div className="flex h-40 items-center justify-center text-sm text-mute">
            No chart data
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Price chart"
          >
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#chartFill)" />
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
