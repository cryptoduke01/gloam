/**
 * Gloam x Partner lockup with its clear space drawn in. Units follow the mark:
 * the tile is 32, the window (w) is 12. Clear space is w on every side; each
 * logo sits 2w from the cross. Drawn in currentColor so it follows the theme.
 */
export function LockupDiagram({ className = "" }: { className?: string }) {
  const w = 12;
  const gap = 2 * w;
  const X = 10;
  const gx = w;
  const mx = gx + 117 + gap;
  const px = mx + X + gap;
  const W = px + 117 + w;
  const H = 32 + 2 * w;
  const cy = w + 16;
  return (
    <svg
      viewBox={`-2 -2 ${W + 4} ${H + 12}`}
      className={`h-auto w-full text-foreground ${className}`}
      role="img"
      aria-label="Gloam and partner lockup. Clear space of one window on every side, two windows between each logo and the cross."
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.35" strokeOpacity="0.45">
        <rect x="0" y="0" width={W} height={H} strokeDasharray="1.4 1.4" />
      </g>
      <rect x="0" y="0" width={w} height={w} fill="currentColor" fillOpacity="0.07" />
      <rect x={W - w} y={H - w} width={w} height={w} fill="currentColor" fillOpacity="0.07" />
      <rect x={gx + 117} y={w} width={gap} height="32" fill="currentColor" fillOpacity="0.05" />
      <rect x={mx + X} y={w} width={gap} height="32" fill="currentColor" fillOpacity="0.05" />

      <g transform={`translate(${gx} ${w})`}>
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <rect x="15" y="4" width="12" height="12" rx="3.5" fill="var(--surface)" />
        <text x="41.5" y="24.6" fontWeight="500" fontSize="25.5" letterSpacing="-0.3825" fill="currentColor">
          Gloam
        </text>
      </g>
      <path
        d={`M${mx} ${cy - X / 2}L${mx + X} ${cy + X / 2}M${mx + X} ${cy - X / 2}L${mx} ${cy + X / 2}`}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x={px + 0.5}
        y={w + 0.5}
        width="116"
        height="31"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeDasharray="2 2"
      />
      <text
        x={px + 58.5}
        y={w + 19.5}
        textAnchor="middle"
        fontWeight="500"
        fontSize="10"
        letterSpacing="0.6"
        fill="currentColor"
        fillOpacity="0.55"
      >
        PARTNER LOGO
      </text>

      <g fill="currentColor" fillOpacity="0.6" fontSize="4" fontWeight="500" textAnchor="middle">
        <text x={w / 2} y={w / 2 + 1.4}>w</text>
        <text x={W - w / 2} y={H - w / 2 + 1.4}>w</text>
        <text x={gx + 117 + gap / 2} y={H + 7}>2w</text>
        <text x={mx + X + gap / 2} y={H + 7}>2w</text>
      </g>
      <g stroke="currentColor" strokeOpacity="0.45" strokeWidth="0.35">
        <path d={`M${gx + 117} ${H + 2}v3M${mx} ${H + 2}v3M${gx + 117} ${H + 3.5}H${mx}`} />
        <path d={`M${mx + X} ${H + 2}v3M${px} ${H + 2}v3M${mx + X} ${H + 3.5}H${px}`} />
      </g>
    </svg>
  );
}
