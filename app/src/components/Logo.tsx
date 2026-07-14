import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${className}`}
    >
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-lime"
        aria-hidden
      >
        <span className="absolute inset-[5px] rounded-full border-[3px] border-ink border-r-transparent" />
        <span className="absolute h-2.5 w-2.5 rounded-full bg-ink" />
      </span>
      <span className="font-display text-xl tracking-tight text-white">
        Gloam
      </span>
    </Link>
  );
}
