"use client";

/** Tiny price path. Stroke comes from the theme's chart tokens. */
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
    // No history yet: a flat hairline holds the space without inventing data.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`text-line-strong ${className}`}
        aria-hidden
      >
        <path
          d={`M 2 ${height / 2} L ${width - 2} ${height / 2}`}
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>
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
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const d = `M ${coords.join(" L ")}`;
  // --chart-up / --chart-down are theme tokens in globals.css.
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
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
