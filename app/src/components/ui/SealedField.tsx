/**
 * The sealed field: Gloam's one luminous glow. Place inside a relative,
 * overflow-hidden box (`.gl-panel`). It is the brand surface and, in the app,
 * the signal that what sits on it is private.
 */
export function SealedField({
  tone = "full",
  drift = false,
  className = "",
}: {
  tone?: "full" | "soft" | "edge";
  drift?: boolean;
  className?: string;
}) {
  const base =
    tone === "soft" ? "gl-field-soft" : tone === "edge" ? "gl-field-edge" : "gl-field";
  return (
    <div
      aria-hidden
      className={`${base}${drift && tone === "full" ? " gl-drift" : ""} ${className}`}
    />
  );
}
