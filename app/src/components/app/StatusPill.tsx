/**
 * Quiet status chip. `lime` is the legacy name for the positive tone, which now
 * reads as the sealed tint (private / ready / verified). `warn` is amber, `mute`
 * is a plain surface chip.
 */
export function StatusPill({
  tone = "mute",
  dot = false,
  children,
}: {
  tone?: "lime" | "mute" | "warn";
  /** Show a leading status dot; pulses softly when tone is lime. */
  dot?: boolean;
  children: React.ReactNode;
}) {
  const styles =
    tone === "lime"
      ? "bg-sealed-soft text-sealed"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-surface text-mute";
  const dotColor =
    tone === "lime" ? "bg-sealed" : tone === "warn" ? "bg-warn" : "bg-faint";
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium leading-none ${styles}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${dotColor} ${
            tone === "lime" ? "livedot" : ""
          }`}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
