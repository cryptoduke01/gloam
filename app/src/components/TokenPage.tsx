"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MotionCard, MotionItem, MotionPress, MotionSection } from "@/components/motion";
import { gloamToken, tokenStatusLabel } from "@/lib/gloamToken";

const ease = [0.22, 1, 0.36, 1] as const;

const specs = [
  { label: "Ticker", value: gloamToken.symbolDisplay },
  { label: "Network", value: gloamToken.chainLabel },
  { label: "Chain ID", value: String(gloamToken.chainId) },
  { label: "Decimals", value: String(gloamToken.decimals) },
  { label: "Supply", value: gloamToken.totalSupplyLabel },
  {
    label: "Contract",
    value: gloamToken.contractAddress
      ? truncateAddr(gloamToken.contractAddress)
      : "Pending",
  },
];

function truncateAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function TokenPage() {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const live = gloamToken.status === "live" && Boolean(gloamToken.contractAddress);

  const copyContract = useCallback(async () => {
    if (!gloamToken.contractAddress) return;
    try {
      await navigator.clipboard.writeText(gloamToken.contractAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
          >
            <div className="absolute -right-24 top-0 h-[420px] w-[420px] rounded-full bg-lime/[0.07] blur-[100px]" />
            <div className="absolute -left-16 bottom-0 h-[280px] w-[280px] rounded-full bg-lime/[0.04] blur-[80px]" />
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage:
                  "radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 75%)",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_10px_var(--lime)]" />
                  {tokenStatusLabel()}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Token · Prepared
                </span>
              </div>

              <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-7">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                    Protocol asset
                  </p>
                  <h1 className="mt-2 font-display text-[3.25rem] leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[5.5rem]">
                    {gloamToken.symbolDisplay}
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
                    {gloamToken.tagline} Built for private hold, send, and trade —
                    launched when the product and utility are ready, not when the
                    feed demands a ticker.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <MotionPress>
                      <Link
                        href="/app"
                        className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                      >
                        Use the product
                      </Link>
                    </MotionPress>
                    <MotionPress>
                      <Link
                        href="/docs"
                        className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
                      >
                        Read docs
                      </Link>
                    </MotionPress>
                    <a
                      href={gloamToken.social.x}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center px-2 text-sm text-mute underline-offset-4 hover:text-foreground hover:underline"
                    >
                      @gloamtrade
                    </a>
                  </div>
                </div>

                {/* Spec card */}
                <motion.div
                  className="lg:col-span-5"
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.08, ease }}
                >
                  <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--lime)_8%,transparent)]">
                    <div className="flex items-center justify-between border-b border-line px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-lg bg-lime font-display text-lg font-medium text-black"
                          aria-hidden
                        >
                          G
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {gloamToken.name}
                          </p>
                          <p className="font-mono text-[11px] text-mute">
                            {gloamToken.symbolDisplay}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                        {gloamToken.status}
                      </span>
                    </div>
                    <dl className="divide-y divide-line">
                      {specs.map((s) => (
                        <div
                          key={s.label}
                          className="flex items-center justify-between gap-4 px-5 py-3"
                        >
                          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                            {s.label}
                          </dt>
                          <dd className="tnum text-right text-sm font-medium text-foreground">
                            {s.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="border-t border-line bg-background/40 px-5 py-4">
                      {live ? (
                        <button
                          type="button"
                          onClick={copyContract}
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-line bg-panel text-sm font-medium text-foreground transition-colors hover:border-lime/40 hover:text-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                        >
                          {copied ? "Copied" : "Copy contract"}
                        </button>
                      ) : (
                        <p className="text-center text-xs leading-relaxed text-mute">
                          Contract address appears here at launch. Never trust
                          unsolicited DMs or lookalikes.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Marquee strip */}
        <section className="border-b border-line bg-panel/50" aria-hidden>
          <div className="token-marquee overflow-hidden py-3">
            <div className="token-marquee-track flex w-max whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
              {[0, 1].map((dup) => (
                <span key={dup} className="inline-flex items-center gap-10 pr-10">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={`${dup}-${i}`} className="inline-flex items-center gap-10">
                      <span className="text-lime">$GLOAM</span>
                      <span>Product first</span>
                      <span>Robinhood Chain</span>
                      <span>Private money</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Why a token */}
        <MotionSection className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <MotionItem>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                Intent
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-2 max-w-2xl font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                A token for the private layer — when it earns one
              </h2>
            </MotionItem>
            <MotionItem>
              <p className="mt-4 max-w-2xl text-mute leading-relaxed">
                Every protocol on a new chain ships a ticker. Most of those
                tickers outrun the product. $GLOAM is staged the other way:
                vault, proofs, and private trade first; coordination asset after
                the rails are real.
              </p>
            </MotionItem>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {gloamToken.utilities.map((u, i) => (
                <MotionCard
                  key={u.id}
                  className="lift group relative overflow-hidden rounded-xl border border-line bg-panel p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime/80 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <h3 className="mt-4 font-display text-xl text-foreground">
                    {u.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">
                    {u.body}
                  </p>
                </MotionCard>
              ))}
            </div>
          </div>
        </MotionSection>

        {/* Roadmap */}
        <MotionSection className="border-b border-line bg-panel/30">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <MotionItem>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                Path
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
                Launch checklist
              </h2>
            </MotionItem>
            <MotionItem>
              <p className="mt-3 max-w-xl text-sm text-mute leading-relaxed">
                Four gates. We do not mint past a closed gate.
              </p>
            </MotionItem>

            <div className="mt-10 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              {gloamToken.phases.map((p, i) => (
                <MotionCard
                  key={p.n}
                  className="relative border border-line bg-background p-5 sm:-ml-px sm:first:ml-0 lg:-ml-px lg:first:ml-0"
                >
                  {i < gloamToken.phases.length - 1 && (
                    <span
                      className="pointer-events-none absolute right-0 top-1/2 hidden h-px w-4 translate-x-full bg-line lg:block"
                      aria-hidden
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-lime">{p.n}</span>
                    <PhasePill state={p.state} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">
                    {p.body}
                  </p>
                </MotionCard>
              ))}
            </div>
          </div>
        </MotionSection>

        {/* Principles + big type */}
        <MotionSection className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <MotionItem>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                  Rules
                </p>
              </MotionItem>
              <MotionItem>
                <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground">
                  How we ship $GLOAM
                </h2>
              </MotionItem>
              <MotionItem>
                <p className="mt-4 text-sm leading-relaxed text-mute">
                  Same bar as the product: plain language, no theater, contract
                  details only from this site and official channels.
                </p>
              </MotionItem>
            </div>
            <ul className="space-y-3 lg:col-span-7">
              {gloamToken.principles.map((line, i) => (
                <li key={line}>
                  <MotionCard className="flex gap-4 rounded-lg border border-line bg-panel px-4 py-4">
                    <span className="tnum shrink-0 font-mono text-xs text-lime">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground">
                      {line}
                    </span>
                  </MotionCard>
                </li>
              ))}
            </ul>
          </div>
        </MotionSection>

        {/* FAQ */}
        <MotionSection className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <MotionItem>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                FAQ
              </p>
            </MotionItem>
            <MotionItem>
              <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground">
                Straight answers
              </h2>
            </MotionItem>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {gloamToken.faqs.map((f) => (
                <MotionItem key={f.q} className="grid gap-2 py-6 sm:grid-cols-12 sm:gap-8">
                  <h3 className="text-sm font-semibold text-foreground sm:col-span-4">
                    {f.q}
                  </h3>
                  <p className="text-sm leading-relaxed text-mute sm:col-span-8">
                    {f.a}
                  </p>
                </MotionItem>
              ))}
            </div>
          </div>
        </MotionSection>

        {/* CTA */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <p className="select-none font-display text-[18vw] leading-none tracking-tighter text-foreground/[0.03]">
              GLOAM
            </p>
          </div>
          <div className="relative mx-auto max-w-6xl px-5 py-16 text-center sm:px-8 sm:py-20">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
              Meanwhile
            </p>
            <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              Trade privately. Token later.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-mute">
              The vault is live on testnet. $GLOAM lands here when gates close —
              not as a side quest for attention.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/app"
                className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
              >
                Open testnet app
              </Link>
              <Link
                href="/whitepaper"
                className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
              >
                Whitepaper
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-panel/40">
          <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
            <p className="text-[11px] leading-relaxed text-mute">
              Not investment advice. Not an offer of securities or a solicitation
              to purchase tokens. Digital assets can go to zero. Official contract
              data will be published only on this page and verified Gloam
              channels.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function PhasePill({ state }: { state: "active" | "next" | "queued" }) {
  const map = {
    active: "bg-lime/15 text-lime border-lime/30",
    next: "bg-panel text-foreground border-line",
    queued: "bg-transparent text-mute border-line",
  };
  const label = { active: "Now", next: "Next", queued: "Later" };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${map[state]}`}
    >
      {label[state]}
    </span>
  );
}
