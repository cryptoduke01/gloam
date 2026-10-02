import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const DOCS = [
  { href: "/terms", label: "Terms of Use", title: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy", title: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy", title: "Cookie Policy" },
  { href: "/disclosures", label: "Risk disclosures", title: "Disclosures" },
];

/**
 * Shared shell for the legal pages: the marketing header and footer around a
 * calm reading column. Typography comes from `.prose-legal` in globals.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-panel text-foreground">
      <Header />

      <main className="mx-auto max-w-[1240px] px-6 pb-8 pt-12 sm:pt-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-20">
          {/* document switcher: a rail on desktop, wrapping chips on mobile */}
          <nav aria-label="Legal documents" className="min-w-0 lg:order-none">
            <div className="lg:sticky lg:top-24">
              <p className="t-label max-lg:hidden">Documents</p>
              <ul className="flex flex-wrap gap-1.5 lg:mt-5 lg:flex-col lg:flex-nowrap lg:gap-0.5">
                {DOCS.map((d) => {
                  const active = d.title === title;
                  return (
                    <li key={d.href} className="shrink-0">
                      <Link
                        href={d.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex h-10 items-center rounded-full px-4 text-[14px] transition-colors lg:rounded-xl lg:px-3 ${
                          active
                            ? "bg-surface font-medium text-foreground"
                            : "text-mute hover:bg-surface hover:text-foreground"
                        }`}
                      >
                        {d.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          <article className="min-w-0 max-w-[68ch]">
            <p className="t-label">Legal</p>
            <h1 className="t-display-l mt-4">{title}</h1>
            <p className="mt-5 text-[14px] text-mute">Last updated {updated}</p>

            <div className="prose-legal mt-12 space-y-5 border-t border-line pt-10 text-[15.5px] leading-[1.75] text-soft [&_code]:rounded-md [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.92em] [&_code]:text-foreground [&_h2]:mt-12! [&_h2]:text-[24px]! [&_h2]:leading-snug [&_h2]:tracking-[-0.015em]">
              {children}
            </div>

            <div className="mt-16 border-t border-line pt-6">
              <Link
                href="/"
                className="t-label inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-sealed"
              >
                <span aria-hidden>←</span> Back to home
              </Link>
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
