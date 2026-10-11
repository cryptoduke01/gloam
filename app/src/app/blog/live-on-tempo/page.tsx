import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SealedField } from "@/components/ui/SealedField";
import { SealDots } from "@/components/ui/SealDots";
import { ArrowUpRight } from "@/components/ui/ArrowUpRight";

const title = "Gloam is live on Tempo";
const description =
  "Gloam brings private balances and payments to Tempo, the payments-first stablecoin L1. Shield a balance, then pay and send without showing your size, while settlement stays verifiable. Live on Tempo Moderato testnet.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog/live-on-tempo" },
  // Setting openGraph here replaces the root one, so the share image is named again.
  openGraph: {
    title,
    description,
    url: "/blog/live-on-tempo",
    siteName: "Gloam",
    type: "article",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Gloam: private money on public chains",
      },
    ],
  },
};

const link =
  "text-foreground underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground";

const GLANCE = [
  { k: "Network", v: "Tempo Moderato testnet" },
  { k: "Asset", v: "PathUSD" },
  { k: "Live today", v: "Add privately, pay, cash out, prove" },
  { k: "Status", v: "Testnet, play money" },
];

/** The cover: a live Tempo payment on the field, in place of an illustration. */
function TempoPayment() {
  return (
    <div className="gl-glass w-full max-w-[380px] p-2 shadow-pop">
      <div className="rounded-[12px] bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[13px] text-foreground">
            <Image
              src="/brand/logos/tempo.svg"
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 rounded-md ring-1 ring-line"
            />
            Tempo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sealed-soft px-2.5 py-1 text-[12px] font-medium text-sealed">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sealed" /> Private
          </span>
        </div>
        <div className="mt-4 rounded-[12px] bg-surface p-3.5">
          <p className="text-[12px] text-mute">Send to</p>
          <p className="mt-1.5 truncate text-[15px] text-foreground">gloamr1.4tPm…q2Ks</p>
        </div>
        <div className="mt-2 rounded-[12px] bg-surface p-3.5">
          <div className="flex items-center justify-between text-[12px] text-mute">
            <span>Amount</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-0.5 text-foreground">
              <Image src="/brand/logos/pathusd.svg" alt="" width={16} height={16} className="h-4 w-4 rounded-full" />
              PathUSD
            </span>
          </div>
          <p className="tnum mt-2 text-[26px] font-light leading-none tracking-[-0.02em]">1,200</p>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 py-2 text-[12px]">
          <span className="text-mute">The explorer shows</span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            Private transfer <SealDots n={4} className="text-foreground/60" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LiveOnTempoPost() {
  return (
    <div className="flex min-h-screen flex-col bg-panel text-foreground">
      <Header />

      <main>
        <article>
          <header className="mx-auto max-w-[68ch] px-6 pt-12 sm:pt-20">
            <p className="t-label flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Link href="/" className="transition-colors hover:text-foreground">
                Gloam
              </Link>
              <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
              <span>Announcement</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
              <time dateTime="2026-09-17">September 17, 2026</time>
            </p>
            <h1 className="t-display-l mt-5">Gloam is live on Tempo</h1>
            <p className="mt-6 text-[18px] leading-relaxed text-soft sm:text-[19px]">
              We build privacy for onchain money, and Tempo is where it makes the
              most sense. It is a payments-first chain built around stablecoins,
              so bringing private balances and payments to it was the obvious
              move.
            </p>
          </header>

          <div className="mx-auto mt-12 max-w-[1400px] px-4 sm:mt-16 sm:px-7">
            <div className="gl-panel mx-auto flex min-h-[420px] max-w-[1200px] items-center justify-center px-5 py-14 sm:min-h-[520px]">
              <SealedField drift />
              <TempoPayment />
            </div>
          </div>

          <div className="mx-auto max-w-[68ch] px-6">
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
              {GLANCE.map((g) => (
                <div key={g.k} className="min-w-0">
                  <dt className="t-label">{g.k}</dt>
                  <dd className="mt-1.5 text-[14px] leading-snug text-foreground">{g.v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-12 space-y-6 text-[17px] leading-[1.75] text-soft">
              <p>
                The idea is simple. You shield a balance, then pay and send without
                putting your size or your holdings on display. Anyone can still
                verify that a payment settled. They just cannot see how much you
                moved or what you are holding. Private for you, provable to
                whoever needs it.
              </p>

              <h2 className="pt-6 text-[26px] font-normal leading-snug tracking-[-0.015em] text-foreground">
                Why Tempo
              </h2>
              <p>
                Public chains put finance on public rails. Every balance, every
                size, every move is visible. That is a fine default for a block
                explorer and a terrible one for real payments. Tempo is a
                payments-first stablecoin L1, so it is exactly the place where
                private stablecoin payments should live. Gloam is the sealed
                chamber on top: self-custodial, permissionless, and provable, not
                an operator who sees everything.
              </p>

              <h2 className="pt-6 text-[26px] font-normal leading-snug tracking-[-0.015em] text-foreground">
                What works today
              </h2>
              <p>
                On Tempo you can shield a stablecoin balance (PathUSD), pay and
                send privately to a receive tag, and cash out to a public balance
                whenever you want it public. You can also make a selective
                disclosure: prove you hold a specific balance to a counterparty or
                an auditor without revealing anything else. The same works for AI
                agents that need to pay for tools without broadcasting every move.
              </p>
              <p>
                Every private action is proof-gated on-chain. There are no mock
                fills and no theatrical privacy. If a path cannot be both private
                and solvent yet, it waits. That is why private trade (sealed swaps)
                is off for now, until the solvency accounting lands.
              </p>

              <h2 className="pt-6 text-[26px] font-normal leading-snug tracking-[-0.015em] text-foreground">
                Honest status
              </h2>
              <p>
                This is Tempo&apos;s Moderato testnet, with play money. The proving
                keys are a development ceremony, so a production multi-party
                ceremony and an external audit are the gate before any mainnet. We
                self-reviewed the contracts across two multi-agent audit passes,
                fixed the findings, and redeployed the hardened pools on both
                Robinhood Chain and Tempo. Gloam is one private core on two chains,
                plus an SDK and an agent surface, not just a single app.
              </p>

              <p>
                Come break it. Open{" "}
                <Link href="/app" className={link}>
                  the app
                </Link>
                , read the{" "}
                <Link href="/docs" className={link}>
                  docs
                </Link>
                , or start with the{" "}
                <Link href="/docs/testnet" className={link}>
                  testnet guide
                </Link>
                .
              </p>
            </div>

            <div className="mt-14 flex flex-wrap items-center gap-2 border-t border-line pt-8">
              <Link href="/app" className="btn btn-ink">
                Open the app
              </Link>
              <a
                href="https://x.com/gloamtrade"
                target="_blank"
                rel="noreferrer"
                className="btn btn-quiet"
              >
                Follow @gloamtrade <ArrowUpRight />
              </a>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
