"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DocsCopyEnhancer } from "./DocsCopyEnhancer";

export type DocNavItem = {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
};

export type GlanceRow = { label: string; value: string };

const nav: { section: string; items: DocNavItem[] }[] = [
  {
    section: "Start here",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/testnet", label: "Testnet guide" },
      { href: "/docs/product", label: "What ships when" },
    ],
  },
  {
    section: "Build on Gloam",
    items: [
      { href: "/docs/sdk", label: "SDK" },
      { href: "/docs/sdk/reference", label: "API reference" },
      { href: "/docs/sdk/disclosure", label: "Selective disclosure" },
      { href: "/docs/agents", label: "Agents" },
    ],
  },
  {
    section: "How it works",
    items: [
      { href: "/docs/encryption", label: "How shield works" },
      { href: "/docs/private-pay", label: "Private pay" },
      { href: "/docs/sealed-trade", label: "Private trade" },
      { href: "/docs/privacy-model", label: "What stays private" },
      { href: "/docs/chain", label: "Robinhood Chain" },
      { href: "/docs/data", label: "Prices & oracles" },
    ],
  },
  {
    section: "Deeper",
    items: [
      { href: "/docs/production", label: "Production gate" },
      { href: "/whitepaper", label: "Whitepaper" },
    ],
  },
];

const allNavHrefs = nav.flatMap((g) => g.items.map((i) => i.href));

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Prefix match only counts if no more-specific nav item also matches, so a
  // parent (e.g. /docs/sdk) does not light up on a child route (/docs/sdk/reference).
  return !allNavHrefs.some(
    (h) =>
      h !== href &&
      h.startsWith(`${href}/`) &&
      (pathname === h || pathname.startsWith(`${h}/`))
  );
}

function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className="shrink-0"
    >
      <rect width="32" height="32" rx="9" fill="#121316" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#F4F3EF" />
    </svg>
  );
}

export function DocsLayout({
  title,
  lede,
  children,
  glance,
  quickLinks,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  glance?: GlanceRow[];
  quickLinks?: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#F4F3EF] text-[#121316]">
      {/* light chrome */}
      <header className="sticky top-0 z-40 border-b border-[#E5E3DD] bg-[#F4F3EF]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-[10px]">
            <Mark size={20} />
            <span className="font-semibold tracking-[-0.01em]">Gloam</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-[#6E6E76]">
            <Link href="/docs" className="hover:text-[#121316]">
              Docs
            </Link>
            <Link href="/whitepaper" className="hidden hover:text-[#121316] sm:inline">
              Whitepaper
            </Link>
            <Link
              href="/app"
              className="rounded-[10px] bg-[#121316] px-4 py-2 text-[13px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <div className="border-b border-[#E5E3DD]">
        <div className="mx-auto grid max-w-[96rem] gap-x-14 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
          {/* Left nav */}
          <aside className="hidden lg:block">
            <nav
              className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-5 py-10"
              aria-label="Docs"
            >
              {nav.map((group) => (
                <div key={group.section} className="mb-8">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a90]">
                    {group.section}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                              active
                                ? "bg-black/[0.05] font-medium text-[#121316]"
                                : "text-[#6E6E76] hover:bg-black/[0.03] hover:text-[#121316]"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          {/* Main */}
          <main className="min-w-0 px-5 py-12 sm:px-10 sm:py-16">
            <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
              {nav.flatMap((g) => g.items).map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-[#3B3766]/40 bg-white text-[#121316]"
                        : "border-[#E5E3DD] text-[#6E6E76] hover:border-[#cfccc4] hover:text-[#121316]"
                    }`}
                  >
                    {item.label.replace(/^\d+\.\s*/, "")}
                  </Link>
                );
              })}
            </div>

            <p className="text-[10px] uppercase tracking-[0.16em] text-[#3B3766]">
              Documentation
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
              {title}
            </h1>
            {lede && (
              <p className="mt-5 max-w-4xl text-base leading-relaxed text-[#565660] sm:text-lg">
                {lede}
              </p>
            )}
            <div className="docs-prose mt-10 max-w-4xl space-y-4 text-[15px]">
              {children}
            </div>
            <DocsCopyEnhancer />
          </main>

          {/* Right rail */}
          <aside className="hidden border-l border-[#E5E3DD] xl:block">
            <div className="sticky top-16 space-y-6 px-5 py-10">
              {glance && glance.length > 0 && (
                <div className="rounded-lg border border-[#E5E3DD] bg-white/70 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a90]">
                    At a glance
                  </p>
                  <dl className="mt-4 space-y-3">
                    {glance.map((row) => (
                      <div
                        key={row.label}
                        className="border-b border-[#E5E3DD] pb-2.5 last:border-0 last:pb-0"
                      >
                        <dt className="text-[10px] uppercase tracking-[0.14em] text-[#8a8a90]">
                          {row.label}
                        </dt>
                        <dd className="mt-1 break-words text-[13px] font-medium leading-snug text-[#121316]">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div className="rounded-lg border border-[#E5E3DD] bg-white/70 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a90]">
                  Quick links
                </p>
                <ul className="mt-3 space-y-2">
                  {(
                    quickLinks ?? [
                      { href: "/app", label: "Open testnet" },
                      { href: "/app/trade?path=sealed", label: "Private trade" },
                      { href: "/docs/testnet", label: "Testnet guide" },
                      { href: "/docs/privacy-model", label: "Privacy model" },
                      { href: "/whitepaper", label: "Whitepaper" },
                      { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
                    ]
                  ).map((l) => (
                    <li key={l.href}>
                      {l.href.startsWith("http") ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between text-sm text-[#6E6E76] transition-colors hover:text-[#121316]"
                        >
                          {l.label}
                          <span className="text-[#3B3766]">→</span>
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="flex items-center justify-between text-sm text-[#6E6E76] transition-colors hover:text-[#121316]"
                        >
                          {l.label}
                          <span className="text-[#3B3766]">→</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* light footer */}
      <footer className="mx-auto flex max-w-[96rem] flex-col gap-3 px-5 py-8 text-[12.5px] text-[#6E6E76] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-[10px]">
          <Mark size={18} />
          <span>Gloam</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/docs" className="hover:text-[#121316]">
            Docs
          </Link>
          <Link href="/whitepaper" className="hover:text-[#121316]">
            Whitepaper
          </Link>
          <a
            href="https://x.com/gloamtrade"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#121316]"
          >
            @gloamtrade
          </a>
        </div>
      </footer>
    </div>
  );
}
