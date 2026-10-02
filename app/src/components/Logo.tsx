import Link from "next/link";

/** The Gloam mark: an ink tile with a sealed window in the corner. */
export function Mark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <rect width="32" height="32" rx="9" fill="var(--foreground)" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="var(--background)" />
    </svg>
  );
}

/** Gloam wordmark: mark + name. */
export function Logo({
  className = "",
  href = "/",
  size = 26,
}: {
  className?: string;
  href?: string;
  size?: number;
}) {
  return (
    <Link
      href={href}
      aria-label="Gloam home"
      className={`inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      <Mark size={size} />
      <span className="text-[19px] font-medium leading-none tracking-[-0.015em] text-foreground">
        Gloam
      </span>
    </Link>
  );
}
