"use client";

/** Tiny price path, theme-aware stroke. */
export function Sparkline({
  points,
  up,
  className = "",
  width = 96,
  height = 32,
}: {
  points: number[];
  up?: boolean;
  className?: string;
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-mute ${className}`}
        style={{ width, height }}
      >, </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return `${x},${y}`;
  });

  const d = `M ${coords.join(" L ")}`;
  // CSS vars: --chart-up / --chart-down set in globals
  const stroke = up === false ? "var(--chart-down)" : "var(--chart-up)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
