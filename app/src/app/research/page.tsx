import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const title = "Research";
const description =
  "Writing by Duke, founder of Gloam, on private money: why payments on public chains need privacy, the models for it, and what we ship.";

export const metadata: Metadata = {
  title,
  description,
  authors: [{ name: "Duke", url: "https://x.com/dukedotsol" }],
  alternates: { canonical: "/research" },
  openGraph: { title: "Gloam research", description, url: "/research", siteName: "Gloam", type: "website" },
};

/** Every post, newest first. A new post goes on top here and in the footer. */
const POSTS: { href: string; date: string; label: string; title: string; summary: string }[] = [
  {
    href: "/blog/private-agent-payments",
    date: "2026-10-23",
    label: "October 23, 2026",
    title: "Agents that pay privately, and check before they pay",
    summary:
      "AI agents spend real money in public, and can be fooled into paying. How Raeto funds agents privately with Gloam, and how Agent Wormhole checks each payment first.",
  },
  {
    href: "/blog/live-on-mainnet",
    date: "2026-10-21",
    label: "October 21, 2026",
    title: "Private money, live on public chains",
    summary: "Why money anyone can read fails the people who use it, and what went live on Robinhood Chain and Tempo mainnet.",
  },
  {
    href: "/blog/privacy-without-an-operator",
    date: "2026-10-14",
    label: "October 14, 2026",
    title: "Privacy with an operator, and privacy without one",
    summary:
      "Private payments are here to stay. The open question is private from whom: the two models, the law around them, and where Gloam stands.",
  },
  {
    href: "/blog/live-on-tempo",
    date: "2026-09-17",
    label: "September 17, 2026",
    title: "Gloam is live on Tempo",
    summary: "Private balances and payments come to Tempo, the payments-first stablecoin chain, on its testnet first, with settlement that stays verifiable.",
  },
];

/** The long reads on the site that explain Gloam itself. */
const EXPLAINED: { href: string; label: string; line: string }[] = [
  { href: "/mainnet", label: "Mainnet launch", line: "Gloam live on Robinhood Chain and Tempo mainnet" },
  { href: "/token", label: "The $GLOAM token", line: "What it does, how fees buy it back, and what comes next" },
  { href: "/docs/compare", label: "How Gloam compares", line: "Against Zama, Arcium, Tempo Zones, Helius Privacy and Railgun" },
  { href: "/whitepaper", label: "Whitepaper", line: "Thesis, architecture, cryptography and roadmap" },
  { href: "/docs/privacy-model", label: "What stays private", line: "What an explorer still shows, and what stays hidden" },
  { href: "/docs/threat-model", label: "Threat model", line: "Who can do what, including us, and the gaps we know about" },
  { href: "/transparency", label: "Transparency", line: "What anyone can check about Gloam, live from the chain" },
];

export default function ResearchPage() {
  return (
    <>
      <Header />
      <main>
        <header className="mx-auto max-w-[68ch] px-6 pt-12 sm:pt-20">
          <p className="t-label flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link href="/" className="transition-colors hover:text-foreground">
              Gloam
            </Link>
            <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
            <span>Research</span>
          </p>
          <h1 className="t-display-l mt-5 text-balance">Research</h1>
          <p className="mt-6 text-[18px] leading-relaxed text-soft sm:text-[19px]">
            Why money on public chains needs privacy, the ways to get it, and what we ship. Written by{" "}
            <a href="https://x.com/dukedotsol" className="text-foreground underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground">
              Duke
            </a>
            , founder of Gloam.
          </p>
        </header>

        <section aria-label="Posts" className="mx-auto mt-12 max-w-[68ch] px-6">
          <ul className="divide-y divide-line border-y border-line">
            {POSTS.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="group block py-7">
                  <time dateTime={p.date} className="tnum text-[13px] text-mute">
                    {p.label}
                  </time>
                  <h2 className="mt-2 text-balance text-[24px] font-normal leading-snug tracking-[-0.015em] text-foreground underline-offset-4 group-hover:underline">
                    {p.title}
                  </h2>
                  <p className="mt-2 text-[16px] leading-relaxed text-soft">{p.summary}</p>
                  <p className="mt-3 text-[13px] text-mute">By Duke</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Gloam, explained" className="mx-auto mb-24 mt-14 max-w-[68ch] px-6">
          <h2 className="text-[20px] font-normal tracking-[-0.01em] text-foreground">Gloam, explained</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EXPLAINED.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="block rounded-2xl border border-line px-5 py-4 transition-colors hover:bg-surface">
                  <span className="block text-[15px] text-foreground">{d.label}</span>
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-mute">{d.line}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
