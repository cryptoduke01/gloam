"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Arrow-style diagram: clear money → encrypt → shielded note → private move → only holder can read.
 * Built in code so labels stay exact (no image-model garble).
 */
const steps = [
  {
    id: "clear",
    label: "Your wallet",
    sub: "Open balance",
    detail: "Normal wallet. Anyone who knows the address can see what it holds.",
  },
  {
    id: "encrypt",
    label: "Shield",
    sub: "Deposit",
    detail: "You send assets into Gloam’s pool. A fingerprint of the deposit is written on-chain.",
  },
  {
    id: "note",
    label: "Your note",
    sub: "Private claim",
    detail: "Your browser keeps the secret that proves the deposit is yours.",
  },
  {
    id: "move",
    label: "Private send",
    sub: "Coming next",
    detail: "Later: move value to someone else without a clear public path. Not fully live yet.",
  },
  {
    id: "read",
    label: "Unshield",
    sub: "Withdraw",
    detail: "You prove ownership and money returns to a normal wallet. Exit is public on purpose.",
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
          Wallet → vault → note → (later private send) → withdraw.
        </p>
      </div>

      {/* Desktop horizontal flow */}
      <div className="hidden lg:block px-6 py-10">
        <svg
          viewBox="0 0 1000 220"
          className="h-auto w-full"
          role="img"
          aria-label="Flow from clear balance through encryption to private transfer"
        >
          {/* connecting line */}
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
                    stroke="#c8ff00"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.55"
                    fill="none"
                  />
                )}
                {i < steps.length - 1 && (
                  <polygon
                    points={`${x + 158},70 ${x + 150},65 ${x + 150},75`}
                    fill="#c8ff00"
                    opacity="0.8"
                  />
                )}
                <circle
                  cx={x}
                  cy={70}
                  r={i === 1 || i === 2 ? 28 : 24}
                  style={{
                    fill: "var(--panel)",
                    stroke: i === 1 || i === 2 ? "#c8ff00" : "var(--line)",
                  }}
                  strokeWidth={i === 1 || i === 2 ? 2 : 1}
                />
                <text
                  x={x}
                  y={74}
                  textAnchor="middle"
                  style={{ fill: i === 1 || i === 2 ? "#c8ff00" : "var(--foreground)" }}
                  fontSize="11"
                  fontFamily="ui-monospace, monospace"
                >
                  {String(i + 1).padStart(2, "0")}
                </text>
                <text
                  x={x}
                  y={130}
                  textAnchor="middle"
                  style={{ fill: "var(--foreground)" }}
                  fontSize="13"
                  fontFamily="Georgia, serif"
                >
                  {s.label}
                </text>
                <text
                  x={x}
                  y={150}
                  textAnchor="middle"
                  style={{ fill: "var(--mute)" }}
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="0.08em"
                >
                  {s.sub.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mobile / tablet stacked steps */}
      <ol className="divide-y divide-line lg:hidden">
        {steps.map((s, i) => (
          <motion.li
            key={s.id}
            className="flex gap-4 px-5 py-5 sm:px-6"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${
                i === 1 || i === 2
                  ? "border-lime text-lime"
                  : "border-line text-mute"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="font-display text-lg text-foreground">{s.label}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                {s.sub}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.detail}</p>
            </div>
          </motion.li>
        ))}
      </ol>

      {/* Desktop detail row */}
      <div className="hidden border-t border-line lg:grid lg:grid-cols-5">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`px-4 py-5 text-xs leading-relaxed text-mute ${
              i < steps.length - 1 ? "border-r border-line" : ""
            }`}
          >
            {s.detail}
          </div>
        ))}
      </div>
    </div>
  );
}
