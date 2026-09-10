import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Gloam docs, private money onchain — on Robinhood Chain and Tempo — explained simply. Shield, unshield, what works on testnet.",
};

export default function DocsOverviewPage() {
  return (
    <DocsLayout
      title="Docs"
      lede="Private money onchain, without the jargon wall. Start here."
      glance={[
        { label: "Product", value: "gloam.trade/app" },
        { label: "Networks", value: "Robinhood + Tempo" },
        { label: "Chain IDs", value: "46630 · 42431" },
        { label: "Live", value: "Vault + private send" },
        { label: "Keys", value: "Dev ceremony" },
      ]}
    >
      <h2 id="what">What is Gloam?</h2>
      <p>
        Gloam is the privacy layer for onchain finance, live on{" "}
        <strong>Robinhood Chain</strong> and <strong>Tempo</strong>. You put
        assets into a shared vault (“shield”), pay privately inside the vault,
        and cash out with a real proof. Goal: what you hold and how much you
        move stays private, instead of sitting in the open like a normal public
        wallet.
      </p>
      <p>
        Right now everything is <strong>testnet</strong>, play money,{" "}
        <strong>development proving keys</strong>. No real dollars.
      </p>

      <PoolPicture title="One picture" />

      <h2 id="try">Try it (2 minutes)</h2>
      <p>
        Full walkthrough:{" "}
        <Link href="/docs/testnet">
          <strong>Testnet guide</strong>
        </Link>
        .
      </p>
      <ol>
        <li>
          Open <Link href="/app">/app</Link>, connect a wallet, and pick a
          network (Robinhood Chain or Tempo).
        </li>
        <li>
          <Link href="/app/shield">Shield</Link> a tiny amount of testnet funds.
        </li>
        <li>
          <Link href="/app/move">Move</Link> to pay a tag or cash out — a browser
          proof settles, never the amount.
        </li>
      </ol>

      <FlowDiagram
        title="What those buttons mean"
        steps={[
          {
            n: "1",
            title: "Shield",
            body: "Deposit into the Gloam vault. Your wallet balance goes down; the vault holds the asset.",
          },
          {
            n: "2",
            title: "Private send",
            body: "Send inside the vault to a receive tag. The sender and amount stay sealed.",
          },
          {
            n: "3",
            title: "Cash out",
            body: "Unshield to a public balance with a real browser proof. Proofs run in your browser.",
          },
        ]}
      />

      <h2 id="works">What works today</h2>
      <ul>
        <li>Connect wallet, portfolio, markets</li>
        <li>
          Send public balances (ETH + stock tokens on Robinhood, stablecoins on
          Tempo)
        </li>
        <li>
          Shield into the vault (ETH/stocks on Robinhood, PathUSD on Tempo)
        </li>
        <li>Private send + receive tags (optional passphrase tickets)</li>
        <li>Cash out (unshield) with a real zero-knowledge proof</li>
        <li>Selective disclosure, verified in the browser</li>
        <li>Note backup (optional lock) in Settings</li>
      </ul>

      <h2 id="not-yet">What does not work yet</h2>
      <ul>
        <li>
          <Link href="/docs/sealed-trade">Private trade</Link> (sealed swap) —
          paused until the H1 solvency accounting lands
        </li>
        <li>
          <Link href="/docs/data">On-chain price oracles</Link> (no Chainlink /
          Pyth / RedStone wired)
        </li>
        <li>
          <Link href="/docs/production">Production ceremony keys / mainnet</Link>
        </li>
        <li>Ethereum expansion (roadmap)</li>
        <li>
          $GLOAM token, prepared page only; not
          launched, no live contract
        </li>
      </ul>

      <h2 id="token">$GLOAM</h2>
      <p>
        The protocol asset ticker is <strong>$GLOAM</strong>. There is no
        tradable contract yet. Status and planned utility will be published through official
        channels. Product and privacy work without a token.
      </p>

      <h2 id="read-next">Read next</h2>
      <ul>
        <li>
          <Link href="/docs/testnet">Testnet guide (full)</Link>
        </li>
        <li>
          <Link href="/docs/encryption">How shield works (simple)</Link>
        </li>
        <li>
          <Link href="/docs/product">What ships when</Link>
        </li>
        <li>
          <Link href="/docs/privacy-model">What stays private vs public</Link>
        </li>
        <li>
          <Link href="/docs/production">Production gate</Link>
        </li>
        <li>
          <Link href="/docs/sealed-trade">Sealed-size private trade</Link>
        </li>
        <li>
          <Link href="/docs/data">Prices, data &amp; oracles</Link>
        </li>
        <li>
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
        <li>
          $GLOAM token
        </li>
      </ul>
    </DocsLayout>
  );
}
