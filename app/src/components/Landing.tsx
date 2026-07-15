"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";
import { HeroPrivacyArt } from "@/components/HeroPrivacyArt";
import { EncryptFlow } from "@/components/EncryptFlow";
import { MotionCard, MotionItem, MotionPress, MotionSection } from "@/components/motion";

const problems = [
  {
    title: "The open confession",
    body: "A public chain records every desire. Swap, size, timing: each line is evidence left for whoever can read a graph.",
    src: "/ascii/trade.png",
    caption: "Open ledger",
  },
  {
    title: "Size as sacrifice",
    body: "Show real weight on a transparent book and the market prices you before settlement. Intent dies in the open air.",
    src: "/ascii/move.png",
    caption: "Hands in the open",
  },
  {
    title: "No private venue",
    body: "Retail lists the equity. It will not build the sealed chamber: private balances, private flow, private trade.",
    src: "/ascii/rim.png",
    caption: "Alone on the book",
  },
];

const steps = [
  {
    n: "01",
    title: "Shield",
    body: "Park assets in the vault. Your open wallet no longer shows that bag. Live on testnet.",
    src: "/ascii/shield.png",
  },
  {
    n: "02",
    title: "Move",
    body: "Private send inside the vault — share a payment code, not a public transfer. Cash out only when you choose the light. Live on testnet.",
    src: "/ascii/move.png",
  },
  {
    n: "03",
    title: "Trade",
    body: "Public wallet swaps, or vault adapter (cash out → swap → re-shield). Sealed-size private trade is next.",
    src: "/ascii/trade.png",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Landing() {
  const reduce = useReducedMotion();

  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <AsciiImage
              src="/ascii/hero.png"
              alt=""
              tone="plate"
              priority
              className="h-full min-h-[420px] w-full"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/94 to-background/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-20">
            <motion.div
              className="lg:col-span-7"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
            >
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-lime">
                <motion.span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-lime"
                  animate={
                    reduce
                      ? undefined
                      : { scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }
                  }
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                Stocks · Memes · Robinhood Chain
              </p>
              <h1 className="mt-4 font-display text-[2.4rem] leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-[3.75rem]">
                Trade Everything on Robinhood Privately
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
                Every transparent ledger is a confession. Gloam is the sealed
                chamber on Robinhood Chain: stocks, memes, whatever is liquid.
                Held, moved, and traded without printing your book to the street.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <MotionPress>
                  <Link
                    href="/docs"
                    className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                  >
                    Read the docs
                  </Link>
                </MotionPress>
                <MotionPress>
                  <Link
                    href="/whitepaper"
                    className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
                  >
                    Whitepaper
                  </Link>
                </MotionPress>
              </div>
            </motion.div>

            <motion.div
              className="lg:col-span-5"
              initial={reduce ? false : { opacity: 0, x: 20, scale: 0.99 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease }}
            >
              <HeroPrivacyArt />
            </motion.div>
          </div>
        </section>

        <section className="border-b border-line bg-panel/60">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5">
            <p className="text-sm text-mute">
              Settles where tokenized equities already live: Robinhood Chain.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-lime">
              Chain ID 4663
            </p>
          </div>
        </section>

        <MotionSection id="product" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
            <MotionItem>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                The condition
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-2 max-w-2xl font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                Transparent ledgers make transparent bags
              </h2>
            </MotionItem>
            <MotionItem>
              <p className="mt-3 max-w-2xl text-mute leading-relaxed">
                Public AMMs and wallet trackers turned every move into spectacle:
                equity tokens and degen books alike. Gloam is the private layer
                for hold, send, and trade when you refuse a live feed of your intent.
              </p>
            </MotionItem>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {problems.map((p) => (
                <MotionCard
                  key={p.title}
                  className="overflow-hidden rounded-lg border border-line bg-panel"
                >
                  <div className="relative aspect-[4/3] w-full border-b border-line">
                    <AsciiImage
                      src={p.src}
                      alt={p.caption}
                      tone="plate"
                      className="h-full w-full"
                      sizes="33vw"
                    />
                    <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/55 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-lime backdrop-blur-sm">
                      {p.caption}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-xl text-foreground">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-mute">
                      {p.body}
                    </p>
                  </div>
                </MotionCard>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection id="encryption" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
            <MotionItem>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                How money is encrypted
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-2 max-w-2xl font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                From clear value to sealed note
              </h2>
            </MotionItem>
            <MotionItem>
              <p className="mt-3 max-w-2xl text-mute leading-relaxed">
                Value does not vanish. It is committed, proved, and reborn as a
                note only a viewing key can read. The explorer sees structure.
                It does not see you.
              </p>
            </MotionItem>
            <MotionItem className="mt-8">
              <EncryptFlow />
            </MotionItem>
          </div>
        </MotionSection>

        <MotionSection id="how" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <MotionItem>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                    The path
                  </p>
                </MotionItem>
                <MotionItem>
                  <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                    Shield. Move. Trade.
                  </h2>
                </MotionItem>
              </div>
              <MotionItem>
                <p className="max-w-md text-sm text-mute lg:text-right">
                  Three gates. Each step stays private until you exit to the
                  public chain by choice, not by default.
                </p>
              </MotionItem>
            </div>

            <div className="relative mt-8">
              <div
                className="absolute bottom-4 left-[1.15rem] top-4 w-px bg-gradient-to-b from-lime via-line to-lime md:left-8"
                aria-hidden
              />
              <ol className="space-y-4 md:space-y-5">
                {steps.map((s, i) => (
                  <motion.li
                    key={s.n}
                    className="relative pl-12 md:pl-20"
                    initial={reduce ? false : { opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.4, delay: i * 0.05, ease }}
                  >
                    <span className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-lime bg-background font-mono text-[11px] text-lime md:left-3.5">
                      {s.n}
                    </span>
                    <div className="grid overflow-hidden rounded-lg border border-line bg-panel md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="relative min-h-[160px] aspect-[16/10] md:aspect-auto md:min-h-[200px]">
                        <AsciiImage
                          src={s.src}
                          alt=""
                          tone="plate"
                          className="h-full w-full"
                          sizes="(max-width: 768px) 100vw, 55vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-panel/90 max-md:bg-gradient-to-t max-md:from-black/80 max-md:via-black/20 max-md:to-transparent" />
                      </div>
                      <div className="flex flex-col justify-center gap-2 p-5 sm:p-7">
                        <h3 className="font-display text-2xl text-foreground sm:text-3xl">
                          {s.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-mute sm:text-base">
                          {s.body}
                        </p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">
                          Gate {s.n}
                        </p>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>
          </div>
        </MotionSection>

        <MotionSection id="chain" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-2 lg:items-center">
            <div>
              <MotionItem>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                  Why Robinhood Chain
                </p>
              </MotionItem>
              <MotionItem>
                <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                  Private rails where the equities already are
                </h2>
              </MotionItem>
              <MotionItem>
                <p className="mt-3 text-mute leading-relaxed">
                  Robinhood Chain is where equities and onchain culture already
                  settle: stock tokens past the close, memes when the tape is
                  loud. Gloam adds shielded balances and private execution so
                  size and strategy remain yours, on both ends of the book.
                </p>
              </MotionItem>
              <ul className="mt-6 space-y-2.5 text-sm text-mute">
                {[
                  "Stocks and memes on the same private rails",
                  "EVM tooling and Uniswap-class liquidity paths",
                  "Privacy as construction, not a skin on a public book",
                ].map((line) => (
                  <MotionItem key={line}>
                    <li className="flex gap-2">
                      <span className="text-lime">→</span> {line}
                    </li>
                  </MotionItem>
                ))}
              </ul>
              <MotionItem className="mt-6">
                <Link
                  href="/whitepaper"
                  className="inline-flex min-h-10 items-center text-sm font-medium text-lime hover:underline"
                >
                  Read the whitepaper →
                </Link>
              </MotionItem>
            </div>
            <MotionItem className="relative aspect-[16/11] overflow-hidden rounded-lg border border-line">
              <div className="relative h-full w-full">
                <AsciiImage
                  src="/ascii/shield.png"
                  alt="Shielded coin"
                  tone="plate"
                  className="h-full w-full"
                  sizes="50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <p className="absolute bottom-5 left-5 right-5 font-display text-xl text-white sm:text-2xl">
                  Private by construction. Public only when you exit.
                </p>
              </div>
            </MotionItem>
          </div>
        </MotionSection>

        <motion.section
          id="waitlist"
          className="border-b border-line bg-lime"
          initial={reduce ? false : { opacity: 0.9, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, ease }}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-12">
            <div>
              <h2 className="font-display text-3xl tracking-tight text-black sm:text-4xl">
                Everything on Robinhood. Privately.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-black/70">
                Stocks. Memes. Shield, transfer, and trade. Testnet product is
                live — connect, explore, no mock private fills.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <MotionPress>
                <Link
                  href="/app"
                  className="inline-flex min-h-11 items-center rounded-md bg-black px-5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open testnet
                </Link>
              </MotionPress>
              <MotionPress>
                <Link
                  href="/docs"
                  className="inline-flex min-h-11 items-center rounded-md border border-black/25 px-5 text-sm font-medium text-black hover:bg-black/5"
                >
                  Docs
                </Link>
              </MotionPress>
            </div>
          </div>
        </motion.section>
      </main>
      <Footer />
    </>
  );
}
