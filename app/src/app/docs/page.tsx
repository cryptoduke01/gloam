import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Gloam docs — private money on Robinhood Chain, explained simply. Shield, unshield, what works on testnet.",
};

export default function DocsOverviewPage() {
  return (
    <DocsLayout
      title="Docs"
      lede="Private money on Robinhood Chain — without the jargon wall. Start here."
      glance={[
        { label: "Product", value: "gloam.trade/app" },
        { label: "Network", value: "RH testnet" },
        { label: "Chain ID", value: "46630" },
        { label: "Live", value: "Vault + private trade" },
        { label: "Keys", value: "Dev ceremony" },
      ]}
    >
      <h2 id="what">What is Gloam?</h2>
      <p>
        Gloam is an app on <strong>Robinhood Chain</strong> where you can put
        assets into a shared vault (“shield”), pay privately inside the vault,
        trade privately (size privacy on by default), and cash out with a real
        proof. Goal: stocks and memes can sit, move, and trade more privately
        than a normal public wallet.
      </p>
      <p>
        Right now everything is <strong>testnet</strong> — play money,{" "}
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
          Open <Link href="/app">/app</Link> and connect a wallet on Robinhood
          testnet.
        </li>
        <li>
          <Link href="/app/shield">Shield</Link> a tiny amount of testnet ETH.
        </li>
        <li>
          <Link href="/app/trade?path=sealed">Trade → Private</Link> sell vault
          ETH for vault stock, or <Link href="/app/move">Move</Link> to pay /
          cash out with a browser proof.
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
            title: "Private trade",
            body: "Vault ETH → vault stock with size privacy on. No public DEX hop.",
          },
          {
            n: "3",
            title: "Move",
            body: "Private send (payment tag) or cash out. Proofs run in your browser.",
          },
        ]}
      />

      <h2 id="works">What works today</h2>
      <ul>
        <li>Connect wallet, portfolio, markets</li>
        <li>Send ETH and faucet stock tokens (public)</li>
        <li>Shield ETH + faucet stocks</li>
        <li>Private send + payment codes (optional passphrase)</li>
        <li>Cash out (unshield) with a real zero-knowledge proof</li>
        <li>
          <Link href="/docs/sealed-trade">Private trade</Link> — size privacy
          on by default (min-out floor)
        </li>
        <li>Vault trade adapter (public swap edge; needs DEX pool)</li>
        <li>Note backup (optional lock) in Settings</li>
      </ul>

      <h2 id="not-yet">What does not work yet</h2>
      <ul>
        <li>
          <Link href="/docs/data">On-chain price oracles</Link> (no Chainlink /
          Pyth / RedStone wired)
        </li>
        <li>
          <Link href="/docs/production">Production ceremony keys / mainnet</Link>
        </li>
        <li>Ethereum expansion (roadmap)</li>
        <li>
          <Link href="/token">$GLOAM token</Link> — prepared page only; not
          launched, no live contract
        </li>
      </ul>

      <h2 id="token">$GLOAM</h2>
      <p>
        The protocol asset ticker is <strong>$GLOAM</strong>. There is no
        tradable contract yet. Status, planned utility, and the launch checklist
        live on the{" "}
        <Link href="/token">token page</Link>. Product and privacy work without
        a token.
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
          <Link href="/token">$GLOAM token</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
