import type { Metadata } from "next";
import Link from "next/link";
import { CopyCommand } from "@/components/CopyCommand";

export const metadata: Metadata = {
  title: "SDK",
  description:
    "@gloam/sdk — the privacy layer for Robinhood Chain, as a package. Add shielded balances, private payments, and selective disclosure to any app or agent.",
};

function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#121316" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#F4F3EF" />
    </svg>
  );
}

const CAPABILITIES = [
  {
    title: "Shielded balances",
    body: "Deposit ETH or tokenized stocks into a private balance only the holder can see or spend.",
  },
  {
    title: "Private payments",
    body: "Send inside the vault to a receive tag. No public transfer, no visible amount.",
  },
  {
    title: "Selective disclosure",
    body: "Prove one balance to a chosen party, revealing nothing else. Provable, not a dark pool.",
  },
  {
    title: "Private agents",
    body: "The same core runs server-side, so an AI agent holds and moves value under policy.",
  },
];

const EXAMPLES = [
  { name: "agent-shield", env: "Node", body: "The smallest agent: mint a note, prove, deposit privately." },
  { name: "pay-bot", env: "Node", body: "A private payment end to end: shield, sync, send." },
  { name: "web-shield", env: "Browser", body: "Shield in the browser, read the balance from chain." },
];

const STEPS = [
  { n: "01", title: "Mint a note", body: "The SDK creates a Poseidon note that binds your secret to the amount and asset." },
  { n: "02", title: "Prove privately", body: "It generates the shield proof in the browser or in node. The secret never leaves the client." },
  { n: "03", title: "Sign and deposit", body: "You sign the resolved shieldBound call. The balance is now private, and yours alone." },
];

export default function SdkLandingPage() {
  return (
    <div className="relative min-h-screen bg-[#F4F3EF] text-[#121316]">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        {/* Nav */}
        <nav className="sticky top-4 z-50 mt-4 flex items-center justify-between gap-4 rounded-[14px] border border-[#E5E3DD] bg-[#F4F3EF]/90 px-4 py-[10px] shadow-[0_1px_2px_rgba(18,19,22,0.05),0_8px_24px_-16px_rgba(18,19,22,0.18)] backdrop-blur-xl sm:px-[18px]">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[16px] font-semibold tracking-[-0.01em]">Gloam</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[#6E6E76] md:flex">
            <Link href="/docs/sdk" className="hover:text-[#121316]">Docs</Link>
            <Link href="/docs/quickstart" className="hover:text-[#121316]">Quickstart</Link>
            <Link href="/docs/agents" className="hover:text-[#121316]">Agents</Link>
            <a href="https://github.com/cryptoduke01/gloam" target="_blank" rel="noreferrer" className="hover:text-[#121316]">GitHub</a>
          </div>
          <Link
            href="/app"
            className="rounded-[10px] border border-[#E5E3DD] bg-white/60 px-4 py-[9px] text-[13.5px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
          >
            Open app
          </Link>
        </nav>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="order-2 lg:order-1">
            <p className="mb-5 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#6E6E76]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3B3766]" />
              The Gloam SDK
            </p>
            <h1 className="text-[clamp(38px,6vw,68px)] font-bold leading-[0.98] tracking-[-0.04em] text-balance">
              The privacy layer,
              <br />
              <span className="text-[#6E6E76]">as a package.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-[16.5px] leading-relaxed text-[#4c4c53]">
              Add shielded balances, private payments, and selective disclosure to
              any Robinhood Chain app or agent. Real zero-knowledge, no proving
              stack to build from scratch.
            </p>
            <div className="mt-8 max-w-[420px] space-y-3">
              <CopyCommand command="npm install @gloam/sdk" />
              <CopyCommand command="npm create gloam-app@latest" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs/quickstart"
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#121316] px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black"
              >
                Quickstart
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/docs/sdk/reference"
                className="inline-flex min-h-11 items-center rounded-[12px] border border-[#E5E3DD] bg-white/60 px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
              >
                API reference
              </Link>
            </div>
          </div>

          {/* 3D logo */}
          <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
            <div className="relative aspect-square w-full max-w-[380px] overflow-hidden rounded-[24px] border border-[#E5E3DD] bg-white">
              <video
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                poster="/media/sdk-hero-poster.jpg"
              >
                <source src="/media/sdk-hero.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="border-t border-[#E5E3DD] py-14 md:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6E6E76]">The surface</p>
          <h2 className="mt-3 max-w-[20ch] text-[clamp(26px,3.6vw,40px)] font-semibold leading-[1.04] tracking-[-0.025em]">
            Everything a private app needs, in one import.
          </h2>
          <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className="rounded-[18px] border border-[#E5E3DD] bg-white/70 p-6">
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#121316]">
                  {cap.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#565660]">{cap.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-[#E5E3DD] py-14 md:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6E6E76]">How shielding works</p>
          <h2 className="mt-3 max-w-[22ch] text-[clamp(26px,3.6vw,40px)] font-semibold leading-[1.04] tracking-[-0.025em]">
            A private balance in three steps.
          </h2>
          <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-[18px] border border-[#E5E3DD] bg-white/70 p-6">
                <span className="text-[13px] font-semibold tracking-[0.02em] text-[#3B3766]">{s.n}</span>
                <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.01em] text-[#121316]">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#565660]">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* One command */}
        <section className="border-t border-[#E5E3DD] py-14 md:py-20">
          <div className="rounded-[22px] border border-[#E5E3DD] bg-white/70 p-7 sm:p-9">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
              <div>
                <h2 className="text-[clamp(22px,2.6vw,30px)] font-semibold leading-[1.06] tracking-[-0.025em]">
                  From zero to shielding in one command.
                </h2>
                <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-[#565660]">
                  <span className="font-semibold text-[#121316]">create-gloam-app</span>{" "}
                  scaffolds a working Next.js app on the SDK, wired and ready. Point
                  your builders at it.
                </p>
              </div>
              <div className="w-full md:w-[320px]">
                <CopyCommand command="npm create gloam-app@latest" />
              </div>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section className="border-t border-[#E5E3DD] py-14 md:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6E6E76]">Start from a reference</p>
          <h2 className="mt-3 text-[clamp(26px,3.6vw,40px)] font-semibold leading-[1.04] tracking-[-0.025em]">
            Three shapes a builder starts from.
          </h2>
          <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <div key={ex.name} className="rounded-[18px] border border-[#E5E3DD] bg-white/70 p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[16px] font-semibold tracking-[-0.01em] text-[#121316]">{ex.name}</span>
                  <span className="shrink-0 rounded-full border border-[#E5E3DD] bg-[#F4F3EF] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[#6E6E76]">
                    {ex.env}
                  </span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-[#565660]">{ex.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <div className="rounded-[22px] bg-[#121316] px-6 py-14 text-center text-[#F4F3EF] sm:px-8">
            <h2 className="mx-auto max-w-[18ch] text-[clamp(26px,4vw,44px)] font-bold leading-[1.04] tracking-[-0.03em]">
              Build the private layer into your app.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-white/60">
              Testnet is live with an open SDK, docs, and examples. Ship private on
              Robinhood Chain today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/docs/quickstart" className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#F4F3EF] px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:bg-white">
                Start building <span aria-hidden>→</span>
              </Link>
              <a href="https://github.com/cryptoduke01/gloam" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[12px] border border-white/20 px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:border-white/50">
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col gap-3 border-t border-[#E5E3DD] py-8 text-[13px] text-[#6E6E76] sm:flex-row sm:items-center sm:justify-between">
          <span>Gloam · the private layer for Robinhood Chain. Testnet, dev-ceremony keys.</span>
          <div className="flex gap-5">
            <Link href="/docs/sdk" className="hover:text-[#121316]">Docs</Link>
            <Link href="/whitepaper" className="hover:text-[#121316]">Whitepaper</Link>
            <a href="https://x.com/gloamtrade" target="_blank" rel="noreferrer" className="hover:text-[#121316]">@gloamtrade</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
