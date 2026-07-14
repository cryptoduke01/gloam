"use client";

import { formatMark } from "@/lib/markets";

/** Larger spark area for trade ticket. */
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
  const stroke = up ? "#c8ff00" : "#f87171";
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
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Price
          </p>
          <p className="mt-1 font-display text-3xl text-foreground">
            {formatMark(mark)}
          </p>
        </div>
        <p className={`font-mono text-sm ${up ? "text-lime" : "text-red-400"}`}>
          {up ? "+" : ""}
          {change24h}%
        </p>
      </div>
      <div className="mt-4 overflow-hidden">
        {points.length < 2 ? (
          <div className="flex h-40 items-center justify-center text-sm text-mute">
            Chart loading…
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Price chart"
          >
            <path d={area} fill={stroke} opacity="0.08" />
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
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
