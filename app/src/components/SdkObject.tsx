/**
 * The animated SDK object: the Gloam mark (rounded square + inset) extruded into
 * a 3D slab that gently sways. The slab is `currentColor` and the inset is the
 * ambient background (`--sdk-bg`), so it renders as the logo on the light page
 * and as the inverted logo on the dark banner. Pure CSS 3D, honours reduced motion.
 */
export function SdkObject({ size = 36 }: { size?: number }) {
  const slices = 8;
  const depth = Math.max(2, Math.round(size * 0.09));
  const inset = Math.round(size * 0.375);
  const insetTop = Math.round(size * 0.125);
  const insetRight = Math.round(size * 0.156);
  const radius = Math.round(size * 0.28);
  const insetRadius = Math.max(1, Math.round(inset * 0.29));

  return (
    <span
      className="sdk-mark-wrap"
      style={{ width: size, height: size, perspective: size * 6 }}
      aria-hidden
    >
      <span className="sdk-mark" style={{ width: size, height: size }}>
        {Array.from({ length: slices }).map((_, i) => {
          const z = -depth + (depth * i) / (slices - 1);
          const isFront = i === slices - 1;
          return (
            <span
              key={i}
              className="sdk-slice"
              style={{ transform: `translateZ(${z}px)`, borderRadius: radius }}
            >
              {isFront && (
                <span
                  className="sdk-inset"
                  style={{
                    width: inset,
                    height: inset,
                    top: insetTop,
                    right: insetRight,
                    borderRadius: insetRadius,
                  }}
                />
              )}
            </span>
          );
        })}
      </span>
    </span>
  );
}
