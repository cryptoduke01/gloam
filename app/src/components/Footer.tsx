import Link from "next/link";
import Image from "next/image";

const product = [
  { href: "/app", label: "Testnet app" },
  { href: "/#product", label: "Product" },
  { href: "/#encryption", label: "Encryption" },
  { href: "/#how", label: "How it works" },
  { href: "/docs", label: "Documentation" },
  { href: "/docs/testnet", label: "Testnet guide" },
  { href: "/whitepaper", label: "Whitepaper" },
  { href: "/token", label: "$GLOAM token" },
];

const company = [
  { href: "/token", label: "$GLOAM" },
  { href: "https://x.com/gloamtrade", label: "X / Twitter", external: true },
  { href: "/disclosures", label: "Risk disclosures" },
];

const legal = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-line bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 select-none overflow-hidden"
        aria-hidden
      >
        <p className="translate-y-1/3 text-center font-display text-[22vw] leading-none tracking-tighter text-foreground/[0.04] sm:text-[18vw]">
          GLOAM
        </p>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-10 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <Image
                src="/brand/logo.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-sm"
              />
              <div>
                <p className="text-xl font-semibold tracking-tight text-foreground">
                  Gloam
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-lime">
                  Private money
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-mute">
              Trade Everything on Robinhood Privately. Stocks, memes, hold, send,
              and trade without turning every move into a public confession.
            </p>
            <div className="mt-8 flex items-center gap-3 border border-line bg-panel px-4 py-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-lime shadow-[0_0_12px_#c8ff00]" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Network
                </p>
                <p className="truncate text-sm text-foreground">
                  Robinhood Chain · 4663
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7 lg:pl-8">
            <FooterCol title="Product" links={product} />
            <FooterCol title="Company" links={company} />
            <FooterCol title="Legal" links={legal} />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl text-[11px] leading-relaxed text-mute">
            © {year} Gloam. Experimental software. Not investment, legal, or tax
            advice. Digital assets can go to zero. Privacy tools reduce public
            visibility. They do not make you invisible to law enforcement,
            chain analysis at the edges, or your own operational mistakes.
          </p>
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
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
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
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
