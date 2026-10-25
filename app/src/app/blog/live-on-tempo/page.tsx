import type { Metadata } from "next";
import Link from "next/link";
import { AppLink } from "@/components/AppLink";
import { ArticleLayout } from "@/components/blog/ArticleLayout";
import { ArrowUpRight } from "@/components/ui/ArrowUpRight";

const title = "Gloam is live on Tempo";
const description =
  "Gloam brings private balances and payments to Tempo, the payments-first stablecoin L1. Shield a balance, then pay and send without showing your size, while settlement stays verifiable. Live on Tempo Moderato testnet.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog/live-on-tempo" },
  authors: [{ name: "Duke", url: "https://x.com/dukedotsol" }],
  openGraph: {
    title,
    description,
    url: "/blog/live-on-tempo",
    siteName: "Gloam",
    type: "article",
    publishedTime: "2026-09-17",
    authors: ["https://x.com/dukedotsol"],
  },
};

const GLANCE = [
  { k: "Network", v: "Tempo Moderato testnet" },
  { k: "Asset", v: "PathUSD" },
  { k: "Live today", v: "Add privately, pay, cash out, prove" },
  { k: "Status", v: "Testnet, play money" },
];

export default function LiveOnTempoPost() {
  return (
    <ArticleLayout
      slug="live-on-tempo"
      lede={
        <p>
          We build privacy for onchain money, and Tempo is where it makes the most
          sense. It is a payments-first chain built around stablecoins, so bringing
          private balances and payments to it was the obvious move.
        </p>
      }
      facts={GLANCE}
      actions={
        <>
          <AppLink href="/app" className="btn btn-ink">
            Open the app
          </AppLink>
          <a href="https://x.com/gloamtrade" target="_blank" rel="noreferrer" className="btn btn-quiet">
            Follow @gloamtrade <ArrowUpRight />
          </a>
        </>
      }
    >
      <p>
        The idea is simple. You shield a balance, then pay and send without
        putting your size or your holdings on display. Anyone can still
        verify that a payment settled. They just cannot see how much you
        moved or what you are holding. Private for you, provable to
        whoever needs it.
      </p>

      <h2>Why Tempo</h2>
      <p>
        Public chains put finance on public rails. Every balance, every
        size, every move is visible. That is a fine default for a block
        explorer and a terrible one for real payments. Tempo is a
        payments-first stablecoin L1, so it is exactly the place where
        private stablecoin payments should live. Gloam is the sealed
        chamber on top: self-custodial, permissionless, and provable, not
        an operator who sees everything.
      </p>

      <h2>What works today</h2>
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

      <h2>Honest status</h2>
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
        <AppLink href="/app">
          the app
        </AppLink>
        , read the{" "}
        <Link href="/docs">
          docs
        </Link>
        , or start with the{" "}
        <Link href="/docs/testnet">
          testnet guide
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
