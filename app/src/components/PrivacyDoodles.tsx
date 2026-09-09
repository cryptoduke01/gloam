/**
 * Gloam privacy doodles — small hand-drawn, paper-cut accents that speak the
 * product's one idea: things stay sealed. Irregular strokes on purpose (marker,
 * not vector-perfect). All decorative, so every one is aria-hidden. Colour comes
 * from `currentColor`, so callers set the tone with `text-*`; the house indigo
 * is #3B3766 on the cream ground.
 *
 * Server-safe (no client hooks). Static by design — no motion to gate.
 */

type DoodleProps = {
  className?: string;
  strokeWidth?: number;
};

/** Marker underline — the signature stroke under a word. */
export function DoodleUnderline({ className, strokeWidth = 3 }: DoodleProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 14"
      preserveAspectRatio="none"
      fill="none"
      className={className}
    >
      <path
        d="M3 9C34 3 58 11 92 6c34-5 62 4 96-1 18-3 34 1 46 3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A watching eye with a slash through it — "reveal nothing". */
export function DoodleCrossedEye({ className, strokeWidth = 2.4 }: DoodleProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 40"
      fill="none"
      className={className}
    >
      <path
        d="M5 21C14 9 27 6 33 6c8 0 20 4 26 15"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M6 27C15 34 26 36 33 36c7 0 17-3 24-9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M33 14c4.4 0 8 3.4 8 7.6 0 1.6-.5 3-1.3 4.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M12 4l40 33"
        stroke="currentColor"
        strokeWidth={strokeWidth + 0.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A little hand-drawn padlock — "shielded". */
export function DoodlePadlock({ className, strokeWidth = 2.4 }: DoodleProps) {
  return (
    <svg aria-hidden viewBox="0 0 40 46" fill="none" className={className}>
      <path
        d="M11 20c-.4-6 .4-13 9-13s9.6 7 9.2 13"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M7.5 21.5c8-1 17-1 25 0 1.6.2 2.4 1.2 2.4 3 .2 4.6.2 9.4 0 14-.1 1.8-1 2.8-2.7 3-8 .9-16.3.9-24.3 0-1.7-.2-2.6-1.2-2.7-3-.3-4.7-.3-9.5 0-14 .1-1.8 .8-2.8 2.3-3z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 29v6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wax-seal starburst stamp — "sealed by a proof". */
export function DoodleSeal({ className, strokeWidth = 2.2 }: DoodleProps) {
  const spikes = 12;
  const cx = 32;
  const cy = 32;
  const outer = 27;
  const inner = 21;
  let d = "";
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    // small jitter so it reads hand-cut, not machined
    const jitter = i % 3 === 0 ? 1.1 : -0.7;
    const x = cx + Math.cos(a) * (r + jitter);
    const y = cy + Math.sin(a) * (r + jitter);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  d += "Z";
  return (
    <svg aria-hidden viewBox="0 0 64 64" fill="none" className={className}>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M24 33c3 4 8 5 15-1"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M27 26.5c.01 0 0 0 0 0M37 26c.01 0 0 0 0 0"
        stroke="currentColor"
        strokeWidth={strokeWidth + 1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A curved hand-drawn arrow — connective tissue between steps. */
export function DoodleArrow({ className, strokeWidth = 2.4 }: DoodleProps) {
  return (
    <svg aria-hidden viewBox="0 0 80 40" fill="none" className={className}>
      <path
        d="M4 20c18-16 46-18 70-4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M63 4c4.4 3.4 8 6 11 12M74 16c-5 1.4-9 2-15 1.6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A hand-drawn circle to ring a number or word — collage emphasis. */
export function DoodleCircle({ className, strokeWidth = 2.4 }: DoodleProps) {
  return (
    <svg aria-hidden viewBox="0 0 72 60" fill="none" className={className}>
      <path
        d="M40 5C22 3 9 12 6 26c-3 15 9 27 30 29 19 1.8 33-7 34-22C71 18 60 8 42 5.4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A small three-point sparkle cluster — a light accent, sparingly. */
export function DoodleSparks({ className, strokeWidth = 2 }: DoodleProps) {
  return (
    <svg aria-hidden viewBox="0 0 40 40" fill="none" className={className}>
      <path
        d="M14 3c0 6-2 8-8 8 6 0 8 2 8 8 0-6 2-8 8-8-6 0-8-2-8-8z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M30 20c0 4-1.4 5.4-5.4 5.4 4 0 5.4 1.4 5.4 5.4 0-4 1.4-5.4 5.4-5.4-4 0-5.4-1.4-5.4-5.4z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}
