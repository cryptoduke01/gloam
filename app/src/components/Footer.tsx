import Link from "next/link";
import { Logo } from "./Logo";

const legal = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/disclosures", label: "Disclosures" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-3">
            <Logo />
            <p className="text-sm leading-relaxed text-mute">
              Trade and move money privately onchain — on Robinhood Chain.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <a
              href="https://docs.gloam.trade"
              className="text-mute hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
            <a
              href="https://x.com/gloamtrade"
              className="text-mute hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              X
            </a>
            {legal.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-mute hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <p className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-mute">
          © {new Date().getFullYear()} Gloam. Experimental software. Not
          financial, legal, or tax advice. Digital assets involve risk of loss.
          Privacy features do not guarantee anonymity or protection from
          subpoenas or chain analysis of unshielded activity.
        </p>
      </div>
    </footer>
  );
}
