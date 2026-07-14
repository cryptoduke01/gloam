import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#chain", label: "Chain" },
  { href: "https://docs.gloam.trade", label: "Docs", external: true },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:h-16 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {links.map((l) =>
            l.external ? (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-mute transition-colors hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-mute transition-colors hover:text-white"
              >
                {l.label}
              </Link>
            )
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/#waitlist"
            className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            Launch testnet
          </Link>
        </div>
      </div>
    </header>
  );
}
