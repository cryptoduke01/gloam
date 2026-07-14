"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { WalletMenu } from "./WalletMenu";

const nav = [
  { href: "/app", label: "Portfolio", exact: true },
  { href: "/app/send", label: "Send" },
  { href: "/app/trade", label: "Trade" },
  { href: "/app/markets", label: "Markets" },
  { href: "/app/shield", label: "Shield" },
  { href: "/app/move", label: "Move" }, // private send + cash out
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden rounded-full border border-lime/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-lime sm:inline">
              Testnet
            </span>
          </div>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Product"
          >
            {nav.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-panel text-foreground"
                      : "text-mute hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <WalletMenu />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-foreground md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "×" : "☰"}
            </button>
          </div>
        </div>
        {open && (
          <nav
            className="border-t border-line px-4 py-3 md:hidden"
            aria-label="Product mobile"
          >
            {nav.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-md px-3 py-3 text-sm ${
                    active ? "bg-panel text-foreground" : "text-mute"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/app/settings"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-3 text-sm text-mute"
            >
              Settings
            </Link>
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-md px-3 py-3 text-sm text-mute"
            >
              ← Marketing site
            </Link>
          </nav>
        )}
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
              Gloam
            </p>
            <h1 className="mt-1 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 max-w-xl text-sm text-mute sm:text-base">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-[11px] text-mute sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Testnet · dev proving keys. Shield, private send, cash out, vault
            trade adapter.{" "}
            <a href="/docs/production" className="text-lime hover:underline">
              Production gate
            </a>
          </p>
          <p className="font-mono uppercase tracking-[0.12em]">gloam.trade</p>
        </div>
      </footer>
    </div>
  );
}
