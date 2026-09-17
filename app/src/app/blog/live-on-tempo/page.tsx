import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const title = "Gloam is live on Tempo";
const description =
  "Gloam brings private balances and payments to Tempo, the payments-first stablecoin L1. Shield a balance, then pay and send without showing your size, while settlement stays verifiable. Live on Tempo Moderato testnet.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "https://gloam.trade/blog/live-on-tempo" },
  openGraph: {
    title,
    description,
    url: "https://gloam.trade/blog/live-on-tempo",
    type: "article",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function LiveOnTempoPost() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F4F3EF] text-[#121316]">
      <Header />

      <article className="mx-auto w-full max-w-[720px] px-5 py-14 sm:px-8 sm:py-20">
        <p className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.18em] text-[#6E6E76]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3B3766]" />
          Announcement · September 17, 2026
        </p>

        <h1 className="mt-4 text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-0.03em] text-balance">
          Gloam is live on Tempo
        </h1>

        <p className="mt-5 max-w-[52ch] text-[18px] leading-relaxed text-[#4c4c53]">
          We build privacy for onchain money, and Tempo is where it makes the most
          sense. It is a payments-first chain built around stablecoins, so bringing
          private balances and payments to it was the obvious move.
        </p>

        <div className="relative mt-9 overflow-hidden rounded-[18px] border border-[#E5E3DD] bg-white shadow-[0_1px_2px_rgba(18,19,22,0.05),0_18px_50px_-24px_rgba(18,19,22,0.28)]">
          <div className="relative aspect-[16/9]">
            <Image
              src="/brand/blindfold-muse.png"
              alt="A blindfolded figure, paper-cut illustration"
              fill
              priority
              className="object-cover object-top"
              sizes="(max-width: 720px) 100vw, 720px"
            />
          </div>
        </div>

        <div className="prose-gloam mt-10 space-y-6 text-[17px] leading-relaxed text-[#2b2b30]">
          <p>
            The idea is simple. You shield a balance, then pay and send without
            putting your size or your holdings on display. Anyone can still verify
            that a payment settled. They just cannot see how much you moved or what
            you are holding. Private for you, provable to whoever needs it.
          </p>

          <h2 className="pt-2 text-[24px] font-semibold tracking-[-0.02em] text-[#121316]">
            Why Tempo
          </h2>
          <p>
            Public chains put finance on public rails. Every balance, every size,
            every move is visible. That is a fine default for a block explorer and a
            terrible one for real payments. Tempo is a payments-first stablecoin L1,
            so it is exactly the place where private stablecoin payments should live.
            Gloam is the sealed chamber on top: self-custodial, permissionless, and
            provable, not an operator who sees everything.
          </p>

          <h2 className="pt-2 text-[24px] font-semibold tracking-[-0.02em] text-[#121316]">
            What works today
          </h2>
          <p>
            On Tempo you can shield a stablecoin balance (PathUSD), pay and send
            privately to a receive tag, and cash out to a public balance whenever you
            want it public. You can also make a selective disclosure: prove you hold a
            specific balance to a counterparty or an auditor without revealing
            anything else. The same works for AI agents that need to pay for tools
            without broadcasting every move.
          </p>
          <p>
            Every private action is proof-gated on-chain. There are no mock fills and
            no theatrical privacy. If a path cannot be both private and solvent yet,
            it waits. That is why private trade (sealed swaps) is off for now, until
            the solvency accounting lands.
          </p>

          <h2 className="pt-2 text-[24px] font-semibold tracking-[-0.02em] text-[#121316]">
            Honest status
          </h2>
          <p>
            This is Tempo&apos;s Moderato testnet, with play money. The proving keys
            are a development ceremony, so a production multi-party ceremony and an
            external audit are the gate before any mainnet. We self-reviewed the
            contracts across two multi-agent audit passes, fixed the findings, and
            redeployed the hardened pools on both Robinhood Chain and Tempo. Gloam is
            one private core on two chains, plus an SDK and an agent surface, not just
            a single app.
          </p>

          <p>
            Come break it. Open{" "}
            <Link
              href="/app"
              className="font-medium text-[#3B3766] underline-offset-2 hover:underline"
            >
              the app
            </Link>
            , read the{" "}
            <Link
              href="/docs"
              className="font-medium text-[#3B3766] underline-offset-2 hover:underline"
            >
              docs
            </Link>
            , or start with the{" "}
            <Link
              href="/docs/testnet"
              className="font-medium text-[#3B3766] underline-offset-2 hover:underline"
            >
              testnet guide
            </Link>
            .
          </p>
        </div>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-[#E5E3DD] pt-8">
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#121316] px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black"
          >
            Open the app →
          </Link>
          <a
            href="https://x.com/gloamtrade"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-[12px] border border-[#E5E3DD] bg-white/60 px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
          >
            Follow @gloamtrade
          </a>
        </div>
      </article>

      <Footer />
    </div>
  );
}
