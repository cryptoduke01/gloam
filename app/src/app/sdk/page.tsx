import type { Metadata } from "next";
import Link from "next/link";
import { SdkObject } from "@/components/SdkObject";
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
    fn: "buildShieldBoundIntent",
  },
  {
    title: "Private payments",
    body: "Send inside the vault to a receive tag. No public transfer, no visible amount.",
    fn: "buildPrivateSendIntent",
  },
  {
    title: "Selective disclosure",
    body: "Prove one balance to a chosen party, revealing nothing else. Provable, not a dark pool.",
    fn: "proveShieldInBrowser",
  },
  {
    title: "Private agents",
    body: "The same core runs server-side, so an AI agent holds and moves value under policy.",
    fn: "@gloam/mcp",
  },
];

const EXAMPLES = [
  { name: "agent-shield", env: "node", body: "The smallest agent: mint a note, prove, deposit privately." },
  { name: "pay-bot", env: "node", body: "A private payment end to end: shield, sync, send." },
  { name: "web-shield", env: "browser", body: "Shield in the browser, read the balance from chain." },
];

const CODE = `import { buildShieldBoundIntent, artifactProver } from "@gloam/sdk";
import { parseEther } from "viem";

// mint a note + generate the shield proof, in the browser or node
const intent = await buildShieldBoundIntent({
  amountWei: parseEther("0.001"),
  prover: artifactProver({ wasm: "shield.wasm", zkey: "shield_final.zkey" }),
});

// sign the resolved call; persist intent.note.secret to spend later
await wallet.writeContract({
  address: intent.exec.poolAddress,
  abi: shieldPoolAbi,
  functionName: intent.exec.fn,   // "shieldBound"
  args: intent.exec.args,
  value: intent.exec.valueWei,
});`;

export default function SdkLandingPage() {
  return (
    <div className="relative min-h-screen bg-[#F4F3EF] text-[#121316]">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        {/* Nav */}
        <nav className="sticky top-4 z-50 mt-4 flex items-center justify-between gap-5 rounded-[14px] border border-[#E5E3DD] bg-white/80 px-[18px] py-[10px] shadow-[0_1px_2px_rgba(18,19,22,0.05),0_8px_24px_-16px_rgba(18,19,22,0.18)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[16px] font-semibold tracking-[-0.01em]">Gloam</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[#6E6E76] sm:flex">
            <Link href="/docs/sdk" className="hover:text-[#121316]">Docs</Link>
            <Link href="/docs/quickstart" className="hover:text-[#121316]">Quickstart</Link>
            <Link href="/docs/agents" className="hover:text-[#121316]">Agents</Link>
            <a href="https://github.com/cryptoduke01/gloam" target="_blank" rel="noreferrer" className="hover:text-[#121316]">GitHub</a>
          </div>
          <Link
            href="/app"
            className="rounded-[10px] border border-[#E5E3DD] bg-white/60 px-4 py-[10px] text-[13.5px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
          >
            Open app
          </Link>
        </nav>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 flex items-center gap-2.5 text-[11px] uppercase tracking-[0.18em] text-[#6E6E76]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3B3766]" />
              @gloam/sdk
            </p>
            <h1 className="text-[clamp(40px,6vw,72px)] font-bold leading-[0.96] tracking-[-0.04em] text-balance">
              The privacy layer,
              <br />
              <span className="text-[#6E6E76]">as a package.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[#4c4c53]">
              Add shielded balances, private payments, and selective disclosure to
              any Robinhood Chain app or agent. Real zero-knowledge, no proving
              stack to build from scratch.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <CopyCommand command="npm install @gloam/sdk" />
              <p className="text-[13px] text-[#6E6E76]">
                or scaffold a working app:{" "}
                <span className="font-mono text-[#121316]">npm create gloam-app@latest</span>
              </p>
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

          {/* Animated object */}
          <div className="relative flex items-center justify-center">
            <div className="relative flex aspect-square w-full max-w-[380px] items-center justify-center overflow-hidden rounded-[24px] border border-[#E5E3DD] bg-[radial-gradient(120%_120%_at_50%_20%,#ffffff,rgba(244,243,239,0.4))]">
              <div
                className="absolute inset-0 opacity-[0.5]"
                style={{
                  backgroundImage:
                    "linear-gradient(#E5E3DD 1px, transparent 1px), linear-gradient(90deg, #E5E3DD 1px, transparent 1px)",
                  backgroundSize: "34px 34px",
                  maskImage: "radial-gradient(70% 70% at 50% 45%, #000, transparent)",
                  WebkitMaskImage: "radial-gradient(70% 70% at 50% 45%, #000, transparent)",
                }}
              />
              <SdkObject size={132} />
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6E76]">The surface</p>
          <h2 className="mt-3 max-w-[22ch] text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.03] tracking-[-0.025em]">
            Everything a private app needs, in one import.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className="rounded-[18px] border border-[#E5E3DD] bg-white/70 p-6">
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#121316]">
                  {cap.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#565660]">{cap.body}</p>
                <p className="mt-4 inline-block rounded-[7px] border border-[#E5E3DD] bg-[#F4F3EF] px-2.5 py-1 font-mono text-[12px] text-[#3B3766]">
                  {cap.fn}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Code */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6E76]">Shielding, in a few lines</p>
              <h2 className="mt-3 text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.03] tracking-[-0.025em]">
                The proof is generated client-side.
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-[#565660]">
                The SDK mints the note and runs the shield prover; you sign the
                resolved call. The note secret is the only spend authority and
                never leaves the client.
              </p>
              <Link href="/docs/sdk" className="mt-6 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-[#3B3766] hover:text-[#121316]">
                Read the docs <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="overflow-x-auto rounded-[16px] border border-[#E5E3DD] bg-[#0e0f12] p-5">
              <pre className="font-mono text-[12.5px] leading-[1.7] text-[#e6e6ea]">
                <code>{CODE}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* One command */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <div className="flex flex-col items-start gap-6 rounded-[20px] border border-[#E5E3DD] bg-white/70 p-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <span className="hidden shrink-0 sm:block">
                <SdkObject size={52} />
              </span>
              <div>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em]">From zero to shielding in one command.</h2>
                <p className="mt-1.5 max-w-[52ch] text-[14.5px] text-[#565660]">
                  <span className="font-mono text-[#121316]">create-gloam-app</span> scaffolds a
                  working Next.js app on the SDK. Point your devs at it.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <CopyCommand command="npm create gloam-app@latest my-private-app" />
            </div>
          </div>
        </section>

        {/* Examples */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6E76]">Start from a reference</p>
          <h2 className="mt-3 text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.03] tracking-[-0.025em]">
            Three shapes a builder starts from.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <div key={ex.name} className="rounded-[18px] border border-[#E5E3DD] bg-white/70 p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[14px] font-semibold text-[#121316]">{ex.name}</span>
                  <span className="rounded-full border border-[#E5E3DD] bg-[#F4F3EF] px-2.5 py-0.5 text-[11px] uppercase tracking-[0.04em] text-[#6E6E76]">
                    {ex.env}
                  </span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-[#565660]">{ex.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[#E5E3DD] py-20">
          <div className="rounded-[22px] bg-[#121316] px-8 py-14 text-center text-[#F4F3EF]">
            <h2 className="mx-auto max-w-[18ch] text-[clamp(28px,4vw,46px)] font-bold leading-[1.02] tracking-[-0.03em]">
              Build the private layer into your app.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] text-white/60">
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
        <footer className="flex flex-col gap-2 border-t border-[#E5E3DD] py-8 text-[13px] text-[#6E6E76] sm:flex-row sm:items-center sm:justify-between">
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
