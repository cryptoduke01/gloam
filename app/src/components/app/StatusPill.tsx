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
      ? "border-lime/40 text-lime"
      : tone === "warn"
        ? "border-amber-500/40 text-amber-500"
        : "border-line text-mute";
  const dotColor =
    tone === "lime"
      ? "bg-lime"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-mute";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${styles}`}
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
