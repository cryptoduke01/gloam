import Link from "next/link";

/** Gloam wordmark — inline crescent "dusk" mark + name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${className}`}
    >
      <svg
        width={30}
        height={30}
        viewBox="0 0 32 32"
        aria-hidden
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="#121316" />
        <circle cx="15" cy="16" r="8" fill="#F4F3EF" />
        <circle cx="19" cy="13" r="7" fill="#121316" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Gloam
      </span>
    </Link>
  );
}
