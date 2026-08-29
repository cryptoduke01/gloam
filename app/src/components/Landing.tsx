import Link from "next/link";

/**
 * Gloam landing — "Twilight" brand.
 * Light, confident, product-forward. Self-contained light palette (the app
 * pages still run the dark tokens during the migration). Type: Clash Display
 * headlines + General Sans body. Signature: the twilight blend + the sealed
 * vault card, which redacts your size where other protocols show a number.
 */

const LEDGER = [
  { ic: "↓", act: "Shield", asset: "ETH", w: 4 },
  { ic: "⇄", act: "Sealed swap", asset: "TSLA", w: 6 },
  { ic: "↗", act: "Private send", asset: "ETH", w: 3 },
];

const SEALED = [
  {
    k: "Your size",
    t: "Off the open book",
    b: "On-chain min-out is a floor, not your real amount. The explorer sees a proof and an asset pair, never how much you moved.",
  },
  {
    k: "Your balance",
    t: "Visible only to you",
    b: "Shielded notes hold your position. A viewing key proves balance to an auditor without revealing your history to everyone else.",
  },
  {
    k: "Your strategy",
    t: "Unlinkable by construction",
    b: "Shield, send, and trade produce independent proofs. No wallet tracker can stitch your moves into a timeline.",
  },
];

function Mark({ size = 22 }: { size?: number }) {
  const notch = Math.round(size * 0.34);
  const off = Math.round(size * 0.27);
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 rounded-[6px] bg-[#121316]"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute rounded-[2px] bg-[#F4F3EF]"
        style={{ width: notch, height: notch, top: off, right: off }}
      />
    </span>
  );
}

function SealedVaultCard() {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E5E3DD] bg-white shadow-[0_1px_2px_rgba(18,19,22,0.04),0_18px_50px_-22px_rgba(18,19,22,0.22)]">
      <div className="flex items-center justify-between border-b border-[#E5E3DD] px-[18px] py-4">
        <div className="flex items-center gap-[10px]">
          <Mark size={20} />
          <span className="text-xs font-semibold tracking-[0.01em] text-[#121316]">
            Sealed Vault
          </span>
        </div>
        <span className="flex items-center gap-[7px] text-[11px] text-[#6E6E76]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D53]" />
          RH testnet
        </span>
      </div>

      <div className="px-[18px] pb-[18px] pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.02em] text-[#6E6E76]">
            Your shielded balance
          </span>
          <span className="text-[11px] font-semibold text-[#3B3766]">
            visible only to you
          </span>
        </div>
        <div className="mt-3 flex gap-[5px]" aria-label="Balance hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-[30px] w-[34px] rounded-[5px] bg-[linear-gradient(180deg,#1a1b1f,#0e0f12)]"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 border-y border-[#E5E3DD]">
        <div className="px-[18px] py-[14px]">
          <div className="text-[10.5px] uppercase tracking-[0.03em] text-[#6E6E76]">
            Proofs verified
          </div>
          <div className="tnum mt-1 text-[19px] font-bold tracking-[-0.01em] text-[#121316]">
            8,412
          </div>
        </div>
        <div className="border-l border-[#E5E3DD] px-[18px] py-[14px]">
          <div className="text-[10.5px] uppercase tracking-[0.03em] text-[#6E6E76]">
            Markets
          </div>
          <div className="tnum mt-1 text-[19px] font-bold tracking-[-0.01em] text-[#121316]">
            TSLA 349{" "}
            <span className="text-[12px] font-medium text-[#6E6E76]">
              · NVDA 466
            </span>
          </div>
        </div>
      </div>

      <div className="px-[18px] pb-1.5 pt-[14px]">
        <div className="mb-2 flex justify-between text-[10.5px] uppercase tracking-[0.03em] text-[#6E6E76]">
          <span>Recent activity</span>
          <span>size hidden</span>
        </div>
        {LEDGER.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-[10px] border-t border-[#E5E3DD] py-[9px] text-[13px] first:border-t-0"
          >
            <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] border border-[#E5E3DD] bg-[#F4F3EF] text-[11px] text-[#6E6E76]">
              {r.ic}
            </span>
            <span className="text-[#121316]">
              {r.act} <span className="text-[#6E6E76]">· {r.asset}</span>
            </span>
            <span className="flex gap-[5px]">
              {Array.from({ length: r.w }).map((_, j) => (
                <span key={j} className="h-[15px] w-4 rounded-[3px] bg-[#DEDCD5]" />
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[#E5E3DD] bg-[#FAFAF8] px-[18px] py-[13px] text-xs">
        <span className="font-mono text-[#6E6E76]">proof 0x1356…f983ffd</span>
        <span className="flex items-center gap-1.5 font-semibold text-[#2E7D53]">
          ✓ verified onchain
        </span>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="relative min-h-screen bg-[#F4F3EF] text-[#121316]">
      {/* twilight atmosphere */}
      <div
        aria-hidden
        className="twilight-atmos pointer-events-none fixed inset-0 z-0"
      />
      <div
        aria-hidden
        className="twilight-grain pointer-events-none fixed inset-0 z-[1] opacity-40 mix-blend-multiply"
      />

      <div className="relative z-[2] mx-auto max-w-6xl px-6">
        {/* nav */}
        <nav className="sticky top-4 z-50 mt-4 flex items-center justify-between gap-5 rounded-[14px] border border-[#E5E3DD] bg-white/80 px-[18px] py-[10px] shadow-[0_1px_2px_rgba(18,19,22,0.05),0_8px_24px_-16px_rgba(18,19,22,0.18)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-[10px]">
            <Mark size={22} />
            <span className="text-[16px] font-semibold tracking-[-0.01em]">
              Gloam
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[#6E6E76] sm:flex">
            <Link href="/app/trade?path=sealed" className="hover:text-[#121316]">
              Trade
            </Link>
            <Link href="/app" className="hover:text-[#121316]">
              Vault
            </Link>
            <Link href="/docs" className="hover:text-[#121316]">
              Docs
            </Link>
            <Link href="/whitepaper" className="hover:text-[#121316]">
              Whitepaper
            </Link>
          </div>
          <Link
            href="/app"
            className="rounded-[10px] border border-[#E5E3DD] bg-white/60 px-4 py-[10px] text-[13.5px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
          >
            Connect
          </Link>
        </nav>

        {/* hero */}
        <section className="grid grid-cols-1 items-center gap-14 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <p className="mb-[22px] flex items-center gap-[9px] text-[12.5px] text-[#6E6E76]">
              <span className="h-[7px] w-[7px] rounded-full bg-[#2E7D53] shadow-[0_0_0_3px_rgba(46,125,83,0.14)]" />
              Live on Robinhood Chain testnet
            </p>
            <h1 className="text-[clamp(44px,6.4vw,80px)] font-[800] leading-[0.95] tracking-[-0.04em] text-balance">
              Trade everything.
              <br />
              <span className="text-[#6E6E76]">Reveal nothing.</span>
            </h1>
            <p className="mt-6 max-w-[44ch] text-[17px] text-[#4c4c53]">
              Shield a balance, trade tokenized stocks and crypto, and settle on
              Robinhood Chain. The chain verifies a proof, never your size.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="group inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#121316] px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
              >
                Open the vault
                <span className="transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              <Link
                href="/docs"
                className="inline-flex min-h-11 items-center rounded-[12px] border border-[#E5E3DD] bg-white/60 px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
              >
                How it works
              </Link>
            </div>
          </div>

          <SealedVaultCard />
        </section>

        {/* what stays sealed */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-20">
          <h2 className="max-w-[18ch] text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.02] tracking-[-0.025em]">
            What settles in public. What stays sealed.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {SEALED.map((s) => (
              <div key={s.k} className="rounded-[14px] border border-[#E5E3DD] bg-white/70 p-6">
                <div className="text-[11px] uppercase tracking-[0.03em] text-[#6E6E76]">
                  {s.k}
                </div>
                <div className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-[#121316]">
                  {s.t}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#565660]">
                  {s.b}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* cta */}
        <section className="border-t border-[#E5E3DD] py-16 md:py-24">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <h2 className="max-w-[16ch] text-[clamp(30px,4.6vw,56px)] font-bold leading-[0.98] tracking-[-0.03em] text-balance">
              Settlement is public. Strategy is not.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app"
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#121316] px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
              >
                Open the vault →
              </Link>
              <Link
                href="/whitepaper"
                className="inline-flex min-h-11 items-center rounded-[12px] border border-[#E5E3DD] bg-white/60 px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
              >
                Read the whitepaper
              </Link>
            </div>
          </div>
        </section>

        {/* footer */}
        <footer className="flex flex-col gap-4 border-t border-[#E5E3DD] py-8 text-[12.5px] text-[#6E6E76] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-[10px]">
            <Mark size={18} />
            <span>Gloam · Robinhood Chain</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="hover:text-[#121316]">
              Docs
            </Link>
            <Link href="/whitepaper" className="hover:text-[#121316]">
              Whitepaper
            </Link>
            <a
              href="https://x.com/gloamtrade"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#121316]"
            >
              @gloamtrade
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
