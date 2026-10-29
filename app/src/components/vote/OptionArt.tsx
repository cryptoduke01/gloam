"use client";

import type { ReactNode } from "react";
import { TokenLogo } from "@/components/app/TokenLogo";

/**
 * Logos and marks beside each answer, keyed by vote and answer position.
 * Kept apart from the vote config, so the published votes never change.
 */
type Mark = { id: string; symbol: string; src?: string };
type Art = { marks?: Mark[]; badges?: Mark[]; icon?: ReactNode };

const chain = (id: number, name: string): Mark => ({ id: `chain-${id}`, symbol: name, src: `/brand/chains/${id}.png` });

const stroke = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
const ICONS: Record<string, ReactNode> = {
  trading: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 17l5-5 4 3 7-8" {...stroke} />
      <path d="M15 7h5v5" {...stroke} />
    </svg>
  ),
  agents: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="5" y="8" width="14" height="11" rx="3" {...stroke} />
      <path d="M12 4v4M9.5 13h.01M14.5 13h.01M9.5 16.5h5" {...stroke} />
    </svg>
  ),
  payroll: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="9" cy="9" r="3" {...stroke} />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" {...stroke} />
      <path d="M16 6.5h4.5M16 10h4.5M17.5 13.5h3" {...stroke} />
    </svg>
  ),
  shopping: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2.5" {...stroke} />
      <path d="M3 10h18M7 14.5h4" {...stroke} />
    </svg>
  ),
};

const ART: Record<string, Art[]> = {
  "private-swaps-next": [
    { marks: [{ id: "tsla", symbol: "TSLA" }, { id: "nvda", symbol: "NVDA" }, { id: "aapl", symbol: "AAPL" }] },
    { marks: [{ id: "pons", symbol: "PONS" }, { id: "cashcat", symbol: "CASHCAT" }, { id: "virtual", symbol: "VIRTUAL" }] },
    { marks: [{ id: "usdc", symbol: "USDC" }, { id: "usdt", symbol: "USDT" }], badges: [chain(8453, "Base"), chain(1, "Ethereum")] },
  ],
  "next-chain": [{ marks: [chain(42161, "Arbitrum")] }, { marks: [chain(56, "BNB Chain")] }, { marks: [chain(137, "Polygon")] }, { marks: [{ id: "chain-solana", symbol: "Solana", src: "/brand/tokens/sol.png" }] }],
  "first-integration": [{ icon: ICONS.trading }, { icon: ICONS.agents }, { icon: ICONS.payroll }, { icon: ICONS.shopping }],
};

export function hasArt(voteId: string): boolean {
  return Boolean(ART[voteId]);
}

/** The marks for one answer: a small overlapping cluster, network badges, or a line icon. */
export function OptionArt({ voteId, index, size = 30 }: { voteId: string; index: number; size?: number }) {
  const art = ART[voteId]?.[index];
  if (!art) return null;
  if (art.icon) {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-foreground" style={{ width: size + 6, height: size + 6 }}>
        {art.icon}
      </span>
    );
  }
  const marks = art.marks ?? [];
  return (
    <span aria-hidden className="relative flex shrink-0 items-center">
      {marks.map((m, i) => (
        <span key={m.id} className="rounded-full ring-2 ring-panel" style={{ marginLeft: i === 0 ? 0 : -size * 0.32, zIndex: marks.length - i }}>
          <TokenLogo id={m.id} symbol={m.symbol} size={size} logoSrc={m.src} className="rounded-full" />
        </span>
      ))}
      {art.badges && (
        <span className="absolute -bottom-1 -right-2 flex">
          {art.badges.map((b, i) => (
            <span key={b.id} className="overflow-hidden rounded-full ring-2 ring-panel" style={{ marginLeft: i === 0 ? 0 : -5, width: size * 0.5, height: size * 0.5 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt="" width={size * 0.5} height={size * 0.5} className="h-full w-full object-cover" />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
