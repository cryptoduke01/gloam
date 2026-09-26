"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { WalletMenu } from "./WalletMenu";
import { WelcomeModal } from "./WelcomeModal";
import { NetworkSelector } from "./NetworkSelector";
import { useNetwork } from "./NetworkProvider";
import { DoodleUnderline } from "@/components/PrivacyDoodles";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  robinhoodOnly?: boolean;
};

const nav: NavItem[] = [
  { href: "/app", label: "Portfolio", exact: true },
  { href: "/app/vault", label: "Vault" }, // shield · trade · send · cash out
  { href: "/app/markets", label: "Markets", robinhoodOnly: true },
  { href: "/app/disclose", label: "Prove" }, // prove you hold a balance
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  // Nav hrefs may include query (?path=sealed), match on path only
  const pathOnly = href.split("?")[0] ?? href;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export function AppShell({
  children,
  title,
  subtitle,
  subtitleTempo,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** Optional Tempo-specific subtitle, so the payments framing leads there. */
  subtitleTempo?: string;
}) {
  const pathname = usePathname();
  const { network } = useNetwork();
  const [open, setOpen] = useState(false);

  // On Tempo the product is private stablecoin payments, not tokenized
  // equities, so tokenized-stock Markets drops out of the app entirely.
  const isTempo = network.key === "tempo";
  const navItems = nav.filter((item) => !(isTempo && item.robinhoodOnly));
  const shownSubtitle = isTempo && subtitleTempo ? subtitleTempo : subtitle;

  useEffect(() => {
    void import("@/lib/track").then(({ track }) => {
      track("app_view", { title: title.slice(0, 40) });
    });
  }, [pathname, title]);

  return (
    <div className="gloam-app relative flex min-h-full flex-col">
      {/* faint ancient watermark, behind everything, app-margin only */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 right-0 -z-10 hidden h-[68vh] w-[42vw] max-w-2xl opacity-[0.06] mix-blend-multiply lg:block"
        style={{
          background:
            "url(/ascii/bust-indigo.png) right bottom / contain no-repeat",
        }}
      />
      <WelcomeModal />
      <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <NetworkSelector />
          </div>
          <nav
            className="app-nav items-center gap-1"
            aria-label="Product"
          >
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={`nav-underline rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "text-foreground"
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
              className="app-burger h-10 w-10 items-center justify-center rounded-md border border-line text-foreground"
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
            {navItems.map((item) => {
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

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8 sm:py-14">
        <div className="rise mb-10">
          <h1 className="inline-block font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            {title}
            {/* signature marker underline, ties the app to the landing */}
            <DoodleUnderline className="pointer-events-none mt-1 block h-2.5 w-full text-lime/70" />
          </h1>
          {shownSubtitle && (
            <p className="mt-2 max-w-xl text-sm text-mute sm:text-base">
              {shownSubtitle}
            </p>
          )}
        </div>
        <div className="rise rise-1">{children}</div>
      </div>

      <AppFooter isTempo={isTempo} navItems={navItems} />
    </div>
  );
}

function AppFooter({
  isTempo,
  navItems,
}: {
  isTempo: boolean;
  navItems: NavItem[];
}) {
  const year = new Date().getFullYear();
  const learn = [
    { href: "/docs", label: "Docs" },
    { href: "/docs/testnet", label: "Testnet guide" },
    { href: "/docs/privacy-model", label: "Privacy model" },
    { href: "/whitepaper", label: "Whitepaper" },
  ];

  return (
    <footer className="mt-16 border-t border-line bg-panel/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          {/* brand + posture */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <Logo />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-mute">
              {isTempo
                ? "Private stablecoin payments on Tempo, for people and for agents. Shield a balance, pay and send without showing your size, and prove what you must."
                : "The privacy layer for onchain money. Shield a balance, then pay, send, and cash out without turning every move into a public confession."}
            </p>
          </div>

          {/* link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="App"
              links={navItems.map((n) => ({ href: n.href, label: n.label }))}
            />
            <FooterCol title="Learn" links={learn} />
            <FooterCol
              title="More"
              links={[
                { href: "/", label: "Home" },
                { href: "/blog/live-on-tempo", label: "Live on Tempo" },
                {
                  href: "https://x.com/gloamtrade",
                  label: "X / Twitter",
                  external: true,
                },
              ]}
            />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[11px] leading-relaxed text-mute">
            © {year} Gloam. Experimental testnet software with play money. Not
            investment, legal, or tax advice.
          </p>
          <p className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-mute">
            gloam.trade
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-lime">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-mute transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-sm text-mute transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
