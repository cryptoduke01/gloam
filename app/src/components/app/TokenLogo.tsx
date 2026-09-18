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

/**
 * Ids with a real brand mark shipped in /public/brand/logos as `<id>.png`.
 * Anything not in the set (or SPECIAL) falls back to a monogram — no 404.
 */
const PNG_LOGO_IDS = new Set([
  // onchain-tradeable
  "tsla", "amzn", "pltr", "nflx", "amd",
  // watchlist (Aumo app-icon set + FMP)
  "hood", "aapl", "nvda", "msft", "googl", "meta", "coin",
  "goog", "avgo", "orcl", "crm", "adbe", "intc", "qcom", "mu", "ibm", "csco",
  "dis", "uber", "abnb", "shop", "pypl", "sbux", "nke", "mcd", "ko", "wmt",
  "cost", "jpm", "v", "ma", "mstr", "gme", "rblx", "rddt", "snap", "f",
  "rivn", "baba", "spot",
  // networks
  "robinhood",
]);

const SPECIAL_LOGOS: Record<string, string> = {
  tempo: "/brand/logos/tempo.svg",
  pathusd: "/brand/logos/pathusd.svg",
  alphausd: "/brand/logos/alphausd.svg",
  betausd: "/brand/logos/betausd.svg",
  thetausd: "/brand/logos/thetausd.svg",
};

function resolveLogo(id: string): string | undefined {
  const key = id.toLowerCase();
  if (SPECIAL_LOGOS[key]) return SPECIAL_LOGOS[key];
  if (PNG_LOGO_IDS.has(key)) return `/brand/logos/${key}.png`;
  return undefined;
}

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
  const src = logoSrc ?? resolveLogo(id);

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-[22%] border border-line bg-white object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] font-semibold text-white ${className}`}
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
