"use client";

import { useId } from "react";

/**
 * Expanded price chart: a clean area chart built from the market's price series.
 * No axes or gridlines beyond a faint baseline — it reads at a glance and stays
 * on the monochrome + green palette (green up, red down).
 */
export function MarketChart({
  points,
  up = true,
  height = 168,
}: {
  points: number[];
  up?: boolean;
  height?: number;
}) {
  const gid = useId();
  const W = 640;
  const H = height;

  if (!points || points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-line bg-background text-sm text-mute"
        style={{ height: H }}
      >
        No price history yet.
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const padX = 6;
  const padY = 14;
  const w = W - padX * 2;
  const h = H - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * w;
    const y = padY + h - ((p - min) / range) * h;
    return [x, y] as const;
  });

  const line = `M ${coords.map(([x, y]) => `${x},${y}`).join(" L ")}`;
  const area = `${line} L ${coords[coords.length - 1][0]},${padY + h} L ${
    coords[0][0]
  },${padY + h} Z`;
  const stroke = up ? "var(--chart-up)" : "var(--chart-down)";
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={padX}
        y1={padY + h}
        x2={W - padX}
        y2={padY + h}
        stroke="var(--line)"
        strokeWidth="1"
      />
      <path d={area} fill={`url(#fill-${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="3.5" fill={stroke} />
    </svg>
  );
}
