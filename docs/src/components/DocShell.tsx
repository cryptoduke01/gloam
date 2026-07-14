import Link from "next/link";

const nav = [
  { href: "/intro", label: "What is Gloam" },
  { href: "/chain", label: "Robinhood Chain" },
  { href: "/privacy-model", label: "Privacy model" },
  { href: "/encryption", label: "How money is encrypted" },
  { href: "/product", label: "Product surface" },
  { href: "/whitepaper", label: "Whitepaper" },
];

export function DocShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="https://gloam.trade" className="text-sm font-medium text-white">
              ← gloam.trade
            </a>
            <Link href="/" className="hidden text-sm text-mute hover:text-white sm:inline">
              Docs home
            </Link>
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-lime">
            docs
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-[200px_1fr] lg:py-14">
        <aside className="hidden lg:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Contents
          </p>
          <nav className="mt-4 space-y-1" aria-label="Docs">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-2 py-1.5 text-sm text-mute transition-colors hover:bg-panel hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 text-[15px] leading-relaxed text-mute">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-lime">
              {eyebrow}
            </p>
          )}
          <h1
            className={`${eyebrow ? "mt-2" : ""} text-3xl tracking-tight text-white sm:text-4xl`}
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {title}
          </h1>
          <div className="mt-8 space-y-4">{children}</div>

          <nav
            className="mt-14 flex flex-wrap gap-2 border-t border-line pt-8 lg:hidden"
            aria-label="Docs mobile"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-mute hover:border-mute hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </main>
      </div>
    </div>
  );
}
