/**
 * The animated SDK object: a slowly rotating wireframe "package" cube with a
 * sealed indigo core. Hairlines inherit currentColor, so it sits on the light
 * page or the dark announcement banner. Pure CSS 3D, honours reduced motion.
 */
export function SdkObject({ size = 36 }: { size?: number }) {
  const h = size / 2;
  const faces: { t: string; sealed?: boolean }[] = [
    { t: `translateZ(${h}px)` },
    { t: `rotateY(180deg) translateZ(${h}px)` },
    { t: `rotateY(90deg) translateZ(${h}px)`, sealed: true },
    { t: `rotateY(-90deg) translateZ(${h}px)` },
    { t: `rotateX(90deg) translateZ(${h}px)` },
    { t: `rotateX(-90deg) translateZ(${h}px)`, sealed: true },
  ];
  return (
    <span
      className="sdk-cube-wrap"
      style={{ width: size, height: size, perspective: size * 7 }}
      aria-hidden
    >
      <span className="sdk-cube" style={{ width: size, height: size }}>
        {faces.map((f, i) => (
          <span
            key={i}
            className={`sdk-face${f.sealed ? " sealed" : ""}`}
            style={{ transform: f.t }}
          />
        ))}
        <span className="sdk-core" />
      </span>
    </span>
  );
}
