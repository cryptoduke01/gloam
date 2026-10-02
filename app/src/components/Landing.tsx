import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SealedField } from "@/components/ui/SealedField";
import { FlowField } from "@/components/ui/FlowField";
import { CursorReveal } from "@/components/ui/CursorReveal";
import { SealDots } from "@/components/ui/SealDots";
import { SealStream } from "@/components/landing/SealStream";
import { PayrollLive } from "@/components/landing/PayrollLive";
import { CodeBlock } from "@/components/ui/CodeBlock";

/**
 * Gloam landing, the "Sealed" system. White ground, light display type, one
 * luminous green field, and live product UI in place of illustration.
 * Signature: the seal stream, payments go in readable and come out sealed.
 */

function Token({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-full"
    />
  );
}

/* ---------- live mini product cards ---------- */

function AddCard() {
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>You add</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-0.5 text-foreground">
            <Token src="/brand/logos/usdg.png" alt="" /> USDG
          </span>
        </div>
        <p className="tnum mt-2 text-[26px] font-light leading-none tracking-[-0.02em]">1,000</p>
      </div>
      <div className="relative z-10 -my-2 mx-auto grid h-7 w-7 place-items-center rounded-full border-4 border-panel bg-sealed-soft text-sealed">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>Private balance</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-sealed">
            <span className="h-1.5 w-1.5 rounded-full bg-sealed" /> Only you
          </span>
        </div>
        <p className="tnum mt-2 text-[26px] font-light leading-none tracking-[-0.02em]">1,000</p>
      </div>
      <span className="btn btn-ink btn-sm btn-block mt-auto" aria-hidden>
        Add privately
      </span>
    </div>
  );
}

function SendCard() {
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="rounded-[12px] bg-surface p-3.5">
        <p className="text-[12px] text-mute">Send to</p>
        <p className="mt-1.5 truncate text-[15px] text-foreground">gloamr1.7fQk…x9Wd</p>
      </div>
      <div className="mt-2 rounded-[12px] bg-surface p-3.5">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <span>Amount</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2 py-0.5 text-foreground">
            <Token src="/brand/logos/pathusd.svg" alt="" /> PathUSD
          </span>
        </div>
        <p className="tnum mt-2 text-[26px] font-light leading-none tracking-[-0.02em]">250</p>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 py-2 text-[12px]">
        <span className="text-mute">The explorer shows</span>
        <span className="text-foreground">
          Private transfer <SealDots n={4} className="ml-1 text-foreground/60" />
        </span>
      </div>
      <span className="btn btn-ink btn-sm btn-block mt-auto" aria-hidden>
        Send privately
      </span>
    </div>
  );
}

function ProveCard() {
  return (
    <div className="flex h-full flex-col rounded-[16px] bg-panel p-4 shadow-card">
      <div className="flex flex-1 flex-col items-center justify-center rounded-[12px] bg-surface px-4 py-5 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-sealed-soft text-sealed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="mt-3 text-[16px] text-foreground">Holds at least $10,000</p>
        <p className="mt-1 text-[12px] text-mute">Verified. Exact balance not shared.</p>
        <p className="mt-3 text-foreground/60">
          <SealDots n={8} />
        </p>
      </div>
      <span className="btn btn-ink btn-sm btn-block mt-3" aria-hidden>
        Share proof
      </span>
    </div>
  );
}

/* ---------- line icons ---------- */

const icon = "h-6 w-6 text-foreground";
function IconPayroll() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16 6.5h4.5M16 10h4.5M17.5 13.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconAgent() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="7" width="15" height="11" rx="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M12 7V4.5M9.5 12h.01M14.5 12h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 15h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconTreasury() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 9.5L12 5l8 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7M4 19h16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconStocks() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 17l4.5-5 3.5 3 7-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const USES = [
  {
    icon: <IconPayroll />,
    title: "Payroll",
    body: "Pay your team in USDG or PathUSD. Nobody can look up who earns what.",
    href: "/docs/payroll",
  },
  {
    icon: <IconAgent />,
    title: "Agent payments",
    body: "Agents pay per call over x402 and MCP without exposing the wallet behind them.",
    href: "/docs/agents",
  },
  {
    icon: <IconTreasury />,
    title: "Treasury",
    body: "Move company money between wallets without broadcasting your runway.",
    href: "/docs/private-pay",
  },
  {
    icon: <IconStocks />,
    title: "Stocks on Robinhood Chain",
    body: "Hold tokenized stocks with the size of your position off the public record.",
    href: "/docs/product",
  },
];

const TRUST = [
  {
    title: "No admin withdraw",
    body: "Nobody, including the Gloam team, can move money out of the vault. That function does not exist.",
  },
  {
    title: "Three days of public notice",
    body: "Any change to how payments are checked is announced on-chain three days before it can take effect.",
  },
  {
    title: "Open source, end to end",
    body: "Contracts, circuits, app and SDK are public. Check the deployed code against the repo yourself.",
  },
];

const SNIPPET = `import { buildGloamPayment, relayIntent } from "@gloamtrade/sdk";

const payment = await buildGloamPayment({ to, amount, asset });
const hash = await relayIntent(payment.intent);
// settled privately, your wallet never shows up`;

export function Landing() {
  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />

      <main>
        {/* hero: owns the first screen, aligned to the nav container */}
        <section className="mx-auto max-w-[1400px] px-4 pt-3 sm:px-7 sm:pt-6">
          <div className="gl-panel flex min-h-[max(520px,calc(100svh-8rem))] flex-col justify-end px-5 pb-8 pt-24 sm:px-10 sm:pb-10 lg:h-[calc(100svh-10rem)] lg:max-h-[980px] lg:min-h-[620px] lg:px-14 lg:pb-14">
            <FlowField />
            <CursorReveal />
            <div className="relative z-10 max-w-[720px]">
              <h1 className="t-display-xl">Private money on public chains</h1>
              <p className="mt-6 max-w-[46ch] text-[18px] leading-[1.55] text-soft sm:text-[18px]">
                Hold, pay and get paid in stablecoins without putting amounts or
                balances on the public record. For people, teams and agents.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link href="/app" className="btn btn-ink btn-lg">
                  Open app
                </Link>
                <Link href="/docs" className="btn btn-quiet btn-lg">
                  Read the docs <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
            <a
              href="#how"
              className="gl-glass absolute bottom-8 right-8 z-10 hidden h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] text-foreground transition-colors hover:bg-panel/70 sm:inline-flex lg:bottom-14 lg:right-14"
            >
              Scroll to explore <span aria-hidden>↓</span>
            </a>
          </div>
        </section>

        {/* thesis + signature */}
        <section id="how" className="scroll-mt-20 pb-6 pt-24 sm:pt-36">
          <div className="mx-auto max-w-[900px] px-6 text-center">
            <h2 className="t-display-l">
              On a public chain, every payment is a postcard. Gloam seals the envelope.
            </h2>
            <p className="mx-auto mt-6 max-w-[58ch] text-[17px] leading-[1.6] text-mute sm:text-[19px]">
              Public blockchains show every amount, every balance and every
              counterparty to anyone who looks. Fine for a protocol. Not for a
              salary, a supplier or a treasury. Gloam keeps settlement public and
              the details private.
            </p>
          </div>
          <div className="mt-12">
            <SealStream />
          </div>
          <div className="mx-auto mt-6 flex max-w-[900px] justify-between px-6 text-[12px] text-mute sm:px-24">
            <span>What a payment normally reveals</span>
            <span>What Gloam lets the world see</span>
          </div>
        </section>

        {/* live product */}
        <section id="payments" className="mx-auto max-w-[1400px] scroll-mt-20 px-4 pb-10 pt-20 sm:px-7 sm:pb-16 sm:pt-32">
          <div className="gl-panel bg-surface px-5 py-12 sm:px-10 sm:py-16">
            <SealedField tone="soft" />
            <div className="relative mx-auto max-w-[720px] text-center">
              <h2 className="t-display-l">Private money is live</h2>
              <p className="mx-auto mt-4 max-w-[52ch] text-[17px] leading-[1.6] text-mute sm:text-[19px]">
                Add money privately, pay anyone, and prove what you hold without
                showing the number. On testnet today, with real contracts.
              </p>
            </div>
            <div className="relative mx-auto mt-10 grid max-w-[1080px] gap-4 md:grid-cols-3">
              {[
                {
                  card: <AddCard />,
                  label: "Private balance",
                  body: "Move USDG, PathUSD or ETH into a balance only you can see.",
                  href: "/docs/product",
                },
                {
                  card: <SendCard />,
                  label: "Private pay",
                  body: "Send to a Gloam address or a claim link. The explorer never sees how much.",
                  href: "/docs/private-pay",
                },
                {
                  card: <ProveCard />,
                  label: "Prove",
                  body: "Show a lender, an auditor or a counterparty exactly what they need. Nothing more.",
                  href: "/docs/sdk/disclosure",
                },
              ].map((c) => (
                <div key={c.label} className="flex flex-col">
                  <div className="gl-glass h-[320px] p-2">{c.card}</div>
                  <Link
                    href={c.href}
                    className="t-label mt-5 inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-sealed"
                  >
                    {c.label} <span aria-hidden>→</span>
                  </Link>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* who it's for */}
        <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-7 sm:py-32">
          <div className="max-w-[720px]">
            <h2 className="t-display-l">Built for money that should not be public</h2>
            <p className="mt-5 max-w-[56ch] text-[17px] leading-[1.6] text-mute sm:text-[19px]">
              Stablecoins made onchain money fast and cheap. Gloam makes it
              discreet enough for the people who actually move it.
            </p>
          </div>
          <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {USES.map((u) => (
              <Link
                key={u.title}
                href={u.href}
                className="gl-tile group flex min-h-[220px] w-[78%] shrink-0 snap-start flex-col p-6 transition-colors hover:bg-surface-2 sm:w-auto"
              >
                {u.icon}
                <div className="mt-auto">
                  <p className="text-[19px] leading-snug tracking-[-0.01em] text-foreground">
                    {u.title}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">{u.body}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* payroll spotlight */}
        <section id="payroll" className="mx-auto max-w-[1400px] scroll-mt-20 px-4 sm:px-7">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="gl-tile flex flex-col justify-between rounded-[24px] p-7 sm:p-10">
              <div>
                <p className="t-label">Private payroll</p>
                <h2 className="t-display-l mt-4 max-w-[13ch]">Run payroll in one upload</h2>
                <p className="mt-5 max-w-[46ch] text-[17px] leading-[1.6] text-mute sm:text-[18px]">
                  Drop in a list of names and amounts. Gloam pays everyone from
                  your private balance and sends each payment for you, so your
                  wallet never shows up either.
                </p>
              </div>
              <div className="mt-10">
                <ul className="divide-y divide-line border-y border-line text-[15px]">
                  <li className="flex justify-between gap-6 py-4">
                    <span>Upload a CSV</span>
                    <span className="text-mute">Name, Gloam address, amount</span>
                  </li>
                  <li className="flex justify-between gap-6 py-4">
                    <span>Check what the public sees</span>
                    <span className="text-mute">No names, no amounts</span>
                  </li>
                  <li className="flex justify-between gap-6 py-4">
                    <span>Pay everyone</span>
                    <span className="text-mute">About 8 seconds each</span>
                  </li>
                </ul>
                <div className="mt-8 flex flex-wrap gap-2">
                  <Link href="/app/payroll" className="btn btn-ink">
                    Run a test payroll
                  </Link>
                  <Link href="/docs/payroll" className="btn btn-quiet">
                    How payroll works
                  </Link>
                </div>
              </div>
            </div>
            <div className="gl-panel flex min-h-[500px] items-center justify-center px-4 py-10 sm:px-10">
              <SealedField drift />
              <PayrollLive />
            </div>
          </div>
        </section>

        {/* developers */}
        <section className="mx-auto max-w-[1400px] px-4 pb-20 pt-20 sm:px-7 sm:pb-32 sm:pt-32">
          <div className="theme-dark gl-panel grid gap-10 border border-transparent bg-[#0b0c0e] px-6 py-12 text-foreground dark:border-line dark:bg-panel sm:px-12 sm:py-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-1/2 -left-1/4 h-[120%] w-[80%] rounded-full opacity-25 blur-[90px]"
              style={{ background: "radial-gradient(closest-side, #8e939b, transparent)" }}
            />
            <div className="relative min-w-0">
              <p className="t-label text-mute">For developers and agents</p>
              <h2 className="t-display-l mt-4 max-w-[15ch] text-foreground">
                Add private payments to anything
              </h2>
              <p className="mt-5 max-w-[48ch] text-[17px] leading-[1.6] text-mute sm:text-[18px]">
                The SDK gives any app or agent private balances, private
                payments and proofs. The MCP server lets an AI agent pay over
                x402 without showing its treasury.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link href="/sdk" className="btn btn-ink">
                  Explore the SDK
                </Link>
                <Link href="/docs/agents" className="btn btn-quiet">
                  Agents guide <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
            <div className="relative min-w-0">
              <CodeBlock code={SNIPPET} lang="ts" title="npm i @gloamtrade/sdk" meta="TypeScript" className="bg-surface" />
              <div className="mt-3 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-3">
                {["SDK on npm", "MCP server", "x402 payments"].map((t) => (
                  <div key={t} className="rounded-[12px] border border-line px-3 py-2.5 text-soft">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* trust */}
        <section className="mx-auto max-w-[1400px] px-4 pb-8 sm:px-7">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="t-display-l max-w-[10ch]">No middlemen</h2>
              <Link
                href="/verify#contracts"
                className="t-label mt-6 inline-flex items-center gap-1.5 text-foreground hover:text-sealed"
              >
                Verify the contracts <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="grid gap-10 sm:grid-cols-3">
              {TRUST.map((t) => (
                <div key={t.title} className="border-t border-foreground pt-5">
                  <p className="text-[18px] leading-snug tracking-[-0.01em]">{t.title}</p>
                  <p className="mt-3 text-[14px] leading-relaxed text-mute">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
