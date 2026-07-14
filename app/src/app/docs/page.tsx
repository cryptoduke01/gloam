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
        { label: "Live", value: "Vault + send" },
        { label: "Keys", value: "Dev ceremony" },
      ]}
    >
      <h2 id="what">What is Gloam?</h2>
      <p>
        Gloam is an app on <strong>Robinhood Chain</strong> where you can put
        assets into a shared vault (“shield”), pay privately inside the vault,
        cash out with a real proof, and use a vault trade adapter. Goal: stocks
        and memes can sit, move, and eventually trade more privately than a
        normal public wallet.
      </p>
      <p>
        Right now everything is <strong>testnet</strong> — play money,{" "}
        <strong>development proving keys</strong>. No real dollars.
      </p>

      <PoolPicture title="One picture" />

      <h2 id="try">Try it (2 minutes)</h2>
      <ol>
        <li>
          Open <Link href="/app">/app</Link> and connect a wallet on Robinhood
          testnet.
        </li>
        <li>
          <Link href="/app/shield">Shield</Link> a tiny amount of testnet ETH.
        </li>
        <li>
          <Link href="/app/move">Move</Link> → private send or cash out with a
          browser proof.
        </li>
      </ol>

      <FlowDiagram
        title="What those buttons mean"
        steps={[
          {
            n: "1",
            title: "Shield",
            body: "Deposit into the Gloam vault. Your wallet balance goes down; the pool holds the asset.",
          },
          {
            n: "2",
            title: "Move",
            body: "Private send (payment code) or cash out. Proofs run in your browser.",
          },
          {
            n: "3",
            title: "Trade adapter",
            body: "Optional: cash out → public swap → re-shield. Size still public on the swap edge.",
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
        <li>Vault trade adapter (public swap edge)</li>
        <li>Note backup (optional lock) in Settings</li>
      </ul>

      <h2 id="not-yet">What does not work yet</h2>
      <ul>
        <li>
          <Link href="/docs/sealed-trade">Sealed-size private trade</Link>
        </li>
        <li>
          <Link href="/docs/production">Production ceremony keys / mainnet</Link>
        </li>
      </ul>

      <h2 id="read-next">Read next</h2>
      <ul>
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
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
