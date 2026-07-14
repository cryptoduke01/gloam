export function StatusPill({
  tone = "mute",
  children,
}: {
  tone?: "lime" | "mute" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "lime"
      ? "border-lime/40 text-lime"
      : tone === "warn"
        ? "border-amber-500/40 text-amber-500"
        : "border-line text-mute";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${styles}`}
    >
      {children}
    </span>
  );
}
