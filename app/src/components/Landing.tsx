"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";
import { HeroPrivacyArt } from "@/components/HeroPrivacyArt";
import { MotionCard, MotionItem, MotionPress, MotionSection } from "@/components/motion";

const problems = [
  {
    title: "Public by default",
    body: "Every swap is a signal. Bots and copy traders read your book as it happens.",
    src: "/ascii/trade.png",
    caption: "Open ledger",
  },
  {
    title: "Size gets farmed",
    body: "Show real size on a transparent AMM and the market prices you before settlement.",
    src: "/ascii/move.png",
    caption: "Hands in the open",
  },
  {
    title: "No serious venue",
    body: "Retail apps list stock tokens. They will not ship private balances or private flow.",
    src: "/ascii/rim.png",
    caption: "Alone on the book",
  },
];

const steps = [
  {
    n: "01",
    title: "Shield",
    body: "Park assets in a shielded balance so the public graph stops tracking what you hold.",
    src: "/ascii/shield.png",
  },
  {
    n: "02",
    title: "Move",
    body: "Send between shielded parties without publishing sender, size, and timing on the open tape.",
    src: "/ascii/move.png",
  },
  {
    n: "03",
    title: "Trade",
    body: "Execute without showing your full hand. Stock tokens first on Robinhood Chain. Liquid markets next.",
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
          <div className="pointer-events-none absolute inset-0 opacity-35">
            <AsciiImage
              src="/ascii/hero.png"
              alt=""
              tone="plate"
              priority
              className="h-full min-h-[560px] w-full"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/55" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:items-center lg:py-28">
            <motion.div
              className="lg:col-span-7"
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
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
                Private money · Robinhood Chain
              </p>
              <h1 className="mt-5 font-display text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-[4.1rem]">
                Trade and move money privately onchain
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
                Shielded balances. Private transfers. Private trading. Stock
                tokens and liquid markets on Robinhood Chain, without printing
                your book to the public chain.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <MotionPress>
                  <Link
                    href="#waitlist"
                    className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                  >
                    Launch testnet
                  </Link>
                </MotionPress>
                <MotionPress>
                  <a
                    href="https://docs.gloam.trade"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
                  >
                    Read the docs
                  </a>
                </MotionPress>
              </div>
            </motion.div>

            <motion.div
              className="lg:col-span-5"
              initial={reduce ? false : { opacity: 0, x: 28, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.12, ease }}
            >
              <HeroPrivacyArt />
            </motion.div>
          </div>
        </section>

        <section className="border-b border-line bg-panel/60">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
            <p className="text-sm text-mute">
              Settles in the Robinhood Chain ecosystem, where tokenized equities
              already live.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-lime">
              Chain ID 4663
            </p>
          </div>
        </section>

        <MotionSection id="product" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <MotionItem>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                The problem
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                Transparent ledgers make transparent bags
              </h2>
            </MotionItem>
            <MotionItem>
              <p className="mt-4 max-w-2xl text-mute">
                Public AMMs and wallet trackers turned every move into content.
                Gloam is the private layer for hold, send, and trade when you do
                not want a live feed of your intent.
              </p>
            </MotionItem>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
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
                  <div className="p-5 sm:p-6">
                    <h3 className="font-display text-xl text-foreground">
                      {p.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                      {p.body}
                    </p>
                  </div>
                </MotionCard>
              ))}
            </div>
          </div>
        </MotionSection>

        <MotionSection id="how" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <MotionItem>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                    How it works
                  </p>
                </MotionItem>
                <MotionItem>
                  <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                    Shield. Move. Trade.
                  </h2>
                </MotionItem>
              </div>
              <MotionItem>
                <p className="max-w-md text-sm text-mute lg:text-right">
                  One path. Three gates. Each step stays private until you exit
                  to the public chain.
                </p>
              </MotionItem>
            </div>

            <div className="relative mt-14">
              <div
                className="absolute bottom-6 left-[1.15rem] top-6 w-px bg-gradient-to-b from-lime via-line to-lime md:left-8"
                aria-hidden
              />
              <ol className="space-y-6 md:space-y-8">
                {steps.map((s, i) => (
                  <motion.li
                    key={s.n}
                    className="relative pl-12 md:pl-20"
                    initial={reduce ? false : { opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-12%" }}
                    transition={{ duration: 0.5, delay: i * 0.06, ease }}
                  >
                    <motion.span
                      className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-lime bg-background font-mono text-[11px] text-lime md:left-3.5"
                      whileHover={reduce ? undefined : { scale: 1.08 }}
                    >
                      {s.n}
                    </motion.span>
                    <motion.div
                      className="grid overflow-hidden rounded-lg border border-line bg-panel md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
                      whileHover={
                        reduce
                          ? undefined
                          : {
                              borderColor: "rgba(200,255,0,0.35)",
                              transition: { duration: 0.2 },
                            }
                      }
                    >
                      <div className="relative min-h-[200px] aspect-[16/10] md:aspect-auto md:min-h-[240px]">
                        <AsciiImage
                          src={s.src}
                          alt=""
                          tone="plate"
                          className="h-full w-full"
                          sizes="(max-width: 768px) 100vw, 55vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-panel/90 max-md:bg-gradient-to-t max-md:from-black/80 max-md:via-black/20 max-md:to-transparent" />
                      </div>
                      <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
                        <h3 className="font-display text-3xl text-foreground sm:text-4xl">
                          {s.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-mute sm:text-base">
                          {s.body}
                        </p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">
                          Gate {s.n}
                        </p>
                      </div>
                    </motion.div>
                  </motion.li>
                ))}
              </ol>
            </div>
          </div>
        </MotionSection>

        <MotionSection id="chain" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <MotionItem>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                  Why Robinhood Chain
                </p>
              </MotionItem>
              <MotionItem>
                <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                  Private rails where the equities already are
                </h2>
              </MotionItem>
              <MotionItem>
                <p className="mt-4 text-mute leading-relaxed">
                  Robinhood Chain is an Arbitrum Orbit L2 for financial services
                  and real-world assets, including stock tokens that trade past
                  the equity close. Gloam adds shielded balances and private
                  execution so size and strategy stay yours.
                </p>
              </MotionItem>
              <ul className="mt-8 space-y-3 text-sm text-mute">
                {[
                  "Tokenized equity markets around the clock",
                  "EVM tooling and Uniswap class liquidity paths",
                  "Privacy as product, not a skin on a public book",
                ].map((line) => (
                  <MotionItem key={line}>
                    <li className="flex gap-2">
                      <span className="text-lime">→</span> {line}
                    </li>
                  </MotionItem>
                ))}
              </ul>
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
          initial={reduce ? false : { opacity: 0.85, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease }}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
            <div>
              <h2 className="font-display text-3xl tracking-tight text-black sm:text-4xl">
                Testnet first. Mainnet when the rails hold.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-black/70">
                We ship shield, transfer, and trade on Robinhood Chain in the
                open. No mock fills. No fake privacy.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <MotionPress>
                <a
                  href="https://x.com/gloamtrade"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md bg-black px-5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Follow @gloamtrade
                </a>
              </MotionPress>
              <MotionPress>
                <a
                  href="https://docs.gloam.trade"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-black/25 px-5 text-sm font-medium text-black hover:bg-black/5"
                >
                  Docs
                </a>
              </MotionPress>
            </div>
          </div>
        </motion.section>

        <section className="relative h-36 overflow-hidden border-b border-line sm:h-48">
          <AsciiImage
            src="/ascii/optional-bleed.png"
            alt=""
            tone="plate"
            className="h-full w-full"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </section>
      </main>
      <Footer />
    </>
  );
}
