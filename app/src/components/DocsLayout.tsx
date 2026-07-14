"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export type DocNavItem = {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
};

export type GlanceRow = { label: string; value: string };

const nav: { section: string; items: DocNavItem[] }[] = [
  {
    section: "Introduction",
    items: [
      { href: "/docs", label: "1. Overview" },
      { href: "/docs/product", label: "2. Product surface" },
    ],
  },
  {
    section: "Protocol",
    items: [
      { href: "/docs/encryption", label: "3. How money is encrypted" },
      { href: "/docs/privacy-model", label: "4. Privacy model" },
      { href: "/docs/chain", label: "5. Robinhood Chain" },
    ],
  },
  {
    section: "Reference",
    items: [{ href: "/whitepaper", label: "Whitepaper" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/docs") return pathname === "/docs";
  return pathname === href || pathname.startsWith(`${href}/`);
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
    <>
      <Header />
      <div className="border-b border-line bg-background">
        <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
          {/* Left nav */}
          <aside className="hidden border-r border-line lg:block">
            <nav
              className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-5 py-10"
              aria-label="Docs"
            >
              {nav.map((group) => (
                <div key={group.section} className="mb-8">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
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
                                ? "bg-panel font-medium text-foreground"
                                : "text-mute hover:bg-panel/80 hover:text-foreground"
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
          <main className="min-w-0 px-5 py-10 sm:px-8 sm:py-14">
            {/* Mobile TOC */}
            <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
              {nav.flatMap((g) => g.items).map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-lime/50 bg-panel text-foreground"
                        : "border-line text-mute hover:border-mute hover:text-foreground"
                    }`}
                  >
                    {item.label.replace(/^\d+\.\s*/, "")}
                  </Link>
                );
              })}
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
              Documentation
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            {lede && (
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-mute sm:text-lg">
                {lede}
              </p>
            )}
            <div className="docs-prose mt-10 max-w-2xl space-y-4 text-[15px]">
              {children}
            </div>
          </main>

          {/* Right rail */}
          <aside className="hidden border-l border-line xl:block">
            <div className="sticky top-16 space-y-6 px-5 py-10">
              {glance && glance.length > 0 && (
                <div className="rounded-lg border border-line bg-panel p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                    At a glance
                  </p>
                  <dl className="mt-4 space-y-3">
                    {glance.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0"
                      >
                        <dt className="text-xs text-mute">{row.label}</dt>
                        <dd className="text-right text-xs font-medium text-foreground">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div className="rounded-lg border border-line bg-panel p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                  Quick links
                </p>
                <ul className="mt-3 space-y-2">
                  {(
                    quickLinks ?? [
                      { href: "/#waitlist", label: "Launch testnet" },
                      { href: "/whitepaper", label: "Whitepaper" },
                      { href: "/", label: "Main site" },
                      {
                        href: "https://x.com/gloamtrade",
                        label: "@gloamtrade",
                      },
                    ]
                  ).map((l) => (
                    <li key={l.href}>
                      {l.href.startsWith("http") ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between text-sm text-mute transition-colors hover:text-foreground"
                        >
                          {l.label}
                          <span className="text-lime">→</span>
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="flex items-center justify-between text-sm text-mute transition-colors hover:text-foreground"
                        >
                          {l.label}
                          <span className="text-lime">→</span>
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
      <Footer />
    </>
  );
}
