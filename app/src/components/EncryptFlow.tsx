"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Privacy stack flow — wallet → shield → note → private move/trade → cash out.
 * Labels stay exact (no image-model garble).
 */
const steps = [
  {
    id: "clear",
    label: "Your wallet",
    sub: "Open balance",
    detail:
      "Normal wallet. Anyone who knows the address can see what it holds.",
  },
  {
    id: "encrypt",
    label: "Shield",
    sub: "Enter vault",
    detail:
      "You deposit into Gloam’s pool. A commitment is written on-chain; the secret stays in your browser.",
  },
  {
    id: "note",
    label: "Vault note",
    sub: "Private claim",
    detail:
      "Your browser holds the secret that proves the deposit is yours. Export a backup.",
  },
  {
    id: "move",
    label: "Private rails",
    sub: "Send · trade",
    detail:
      "Private send and private trade settle in the vault. Size stays off the open book by default.",
  },
  {
    id: "read",
    label: "Cash out",
    sub: "Public exit",
    detail:
      "You prove ownership and money returns to a wallet. Exit publishes amount on purpose.",
  },
];

export function EncryptFlow() {
  const reduce = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
          How Gloam works
        </p>
        <p className="mt-1 text-sm text-mute">
          Wallet → shield → vault note → private send / trade → cash out only
          when you choose.
        </p>
      </div>

      {/* Desktop horizontal flow */}
      <div className="hidden px-6 py-10 lg:block">
        <svg
          viewBox="0 0 1000 220"
          className="h-auto w-full"
          role="img"
          aria-label="Flow from open wallet through vault privacy to cash out"
        >
          <line
            x1="80"
            y1="70"
            x2="920"
            y2="70"
            stroke="currentColor"
            className="text-line"
            strokeWidth="1"
          />
          {steps.map((s, i) => {
            const x = 80 + i * 210;
            return (
              <g key={s.id}>
                {i < steps.length - 1 && (
                  <path
                    d={`M ${x + 52} 70 L ${x + 158} 70`}
                    stroke="currentColor"
                    className="text-lime"
                    strokeWidth="1.5"
                    fill="none"
                    markerEnd="url(#arrow)"
                  />
                )}
                <circle
                  cx={x}
                  cy={70}
                  r="28"
                  className="fill-panel stroke-lime"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={76}
                  textAnchor="middle"
                  className="fill-lime font-mono text-[11px]"
                >
                  {String(i + 1).padStart(2, "0")}
                </text>
                <text
                  x={x}
                  y={120}
                  textAnchor="middle"
                  className="fill-foreground text-[13px]"
                  style={{ fontFamily: "var(--font-display), Georgia, serif" }}
                >
                  {s.label}
                </text>
                <text
                  x={x}
                  y={140}
                  textAnchor="middle"
                  className="fill-mute font-mono text-[9px] uppercase"
                >
                  {s.sub}
                </text>
              </g>
            );
          })}
          <defs>
            <marker
              id="arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" className="fill-lime" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Mobile / tablet list */}
      <ol className="divide-y divide-line lg:hidden">
        {steps.map((s, i) => (
          <motion.li
            key={s.id}
            className="px-5 py-4 sm:px-6"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.05 }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              {String(i + 1).padStart(2, "0")} · {s.sub}
            </p>
            <p className="mt-1 font-display text-xl text-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-mute">{s.detail}</p>
          </motion.li>
        ))}
      </ol>

      <div className="hidden border-t border-line px-6 py-4 lg:block">
        <div className="grid grid-cols-5 gap-3">
          {steps.map((s) => (
            <p key={s.id} className="text-xs leading-relaxed text-mute">
              {s.detail}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
