"use client";

import { useState } from "react";

/**
 * Ticker/token logo. Renders a real image from /brand/logos/<id>.png when one is
 * present, and otherwise a clean monogram tile derived from the symbol. The tile
 * colour is picked deterministically from the symbol so each market keeps a
 * stable identity without shipping (or hot-linking) a brand asset for every one.
 */
const TILE_COLORS = [
  "#2E7D53", // green
  "#3B3766", // indigo
  "#8A5A2B", // umber
  "#4B5563", // slate
  "#7C3AED", // violet
  "#B45309", // amber-brown
  "#0F766E", // teal
  "#9F1239", // rose
];

function tileColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** Real brand marks that ship in /public/brand/logos. Anything else = monogram. */
const KNOWN_LOGOS: Record<string, string> = {
  tsla: "/brand/logos/tsla.png",
  amzn: "/brand/logos/amzn.png",
  pltr: "/brand/logos/pltr.png",
  nflx: "/brand/logos/nflx.png",
  amd: "/brand/logos/amd.png",
  hood: "/brand/logos/hood.png",
  robinhood: "/brand/logos/robinhood.png",
  tempo: "/brand/logos/tempo.svg",
};

export function TokenLogo({
  id,
  symbol,
  size = 34,
  logoSrc,
  className = "",
}: {
  id: string;
  symbol: string;
  size?: number;
  /** Real logo path. When omitted, a monogram tile is shown (no 404 request). */
  logoSrc?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const ticker = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const label = ticker.slice(0, 4);
  const bg = tileColor(symbol || id);
  // Scale the ticker to fit the tile: shorter tickers read larger.
  const fontRatio =
    label.length <= 2 ? 0.4 : label.length === 3 ? 0.32 : 0.26;
  const src = logoSrc ?? KNOWN_LOGOS[id.toLowerCase()];

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full border border-line bg-white object-contain p-[3px] ${className}`}
        style={{
          width: size,
          height: size,
          filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.18))",
        }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * fontRatio),
        letterSpacing: "-0.03em",
      }}
      title={symbol}
    >
      {label}
    </span>
  );
}
