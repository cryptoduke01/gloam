import Link from "next/link";

/** Gloam wordmark, inline crescent "dusk" mark + name. */
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
        <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#F4F3EF" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Gloam
      </span>
    </Link>
  );
}
