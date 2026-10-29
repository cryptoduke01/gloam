import type { ReactNode } from "react";

/**
 * Logos and marks beside each answer, keyed by vote and answer position. Kept
 * apart from the vote config, so the published votes never change. The vote
 * page (components/vote/OptionArt) and the link preview cards both read it.
 */
export type OptionMark = { id: string; symbol: string; src?: string };
export type OptionArtSpec = { marks?: OptionMark[]; badges?: OptionMark[]; icon?: OptionIconName };
export type OptionIconName = "trading" | "agents" | "payroll" | "shopping";

const chain = (id: number, name: string): OptionMark => ({ id: `chain-${id}`, symbol: name, src: `/brand/chains/${id}.png` });

export const OPTION_ART: Record<string, OptionArtSpec[]> = {
  "private-swaps-next": [
    { marks: [{ id: "tsla", symbol: "TSLA" }, { id: "nvda", symbol: "NVDA" }, { id: "aapl", symbol: "AAPL" }] },
    { marks: [{ id: "pons", symbol: "PONS" }, { id: "cashcat", symbol: "CASHCAT" }, { id: "virtual", symbol: "VIRTUAL" }] },
    { marks: [{ id: "usdc", symbol: "USDC" }, { id: "usdt", symbol: "USDT" }], badges: [chain(8453, "Base"), chain(1, "Ethereum")] },
  ],
  "next-chain": [
    { marks: [chain(42161, "Arbitrum")] },
    { marks: [chain(56, "BNB Chain")] },
    { marks: [chain(137, "Polygon")] },
    { marks: [{ id: "chain-solana", symbol: "Solana", src: "/brand/tokens/sol.png" }] },
  ],
  "first-integration": [{ icon: "trading" }, { icon: "agents" }, { icon: "payroll" }, { icon: "shopping" }],
};

/** A line icon in the current text colour. */
export function OptionIcon({ name, size = 22, color = "currentColor" }: { name: OptionIconName; size?: number; color?: string }): ReactNode {
  const stroke = { stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const shapes: Record<OptionIconName, ReactNode> = {
    trading: (
      <>
        <path d="M4 17l5-5 4 3 7-8" {...stroke} />
        <path d="M15 7h5v5" {...stroke} />
      </>
    ),
    agents: (
      <>
        <rect x="5" y="8" width="14" height="11" rx="3" {...stroke} />
        <path d="M12 4v4M9.5 13h.01M14.5 13h.01M9.5 16.5h5" {...stroke} />
      </>
    ),
    payroll: (
      <>
        <circle cx="9" cy="9" r="3" {...stroke} />
        <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" {...stroke} />
        <path d="M16 6.5h4.5M16 10h4.5M17.5 13.5h3" {...stroke} />
      </>
    ),
    shopping: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2.5" {...stroke} />
        <path d="M3 10h18M7 14.5h4" {...stroke} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {shapes[name]}
    </svg>
  );
}
