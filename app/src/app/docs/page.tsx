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
        { label: "Live", value: "Shield + unshield" },
        { label: "Not yet", value: "Private send" },
      ]}
    >
      <h2 id="what">What is Gloam?</h2>
      <p>
        Gloam is an app on <strong>Robinhood Chain</strong> where you can put
        assets into a shared vault (“shield”) and take them out again with a
        real proof (“unshield”). Goal: stocks and memes can sit and trade more
        privately than a normal public wallet.
      </p>
      <p>
        Right now everything is <strong>testnet</strong> — play money. No real
        dollars.
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
          <Link href="/app/move">Move</Link> → prove &amp; unshield → ETH returns
          to your wallet.
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
            title: "Note",
            body: "Your browser keeps a private record so only you can exit that deposit later.",
          },
          {
            n: "3",
            title: "Unshield",
            body: "Prove ownership and withdraw to a normal address. Exit shows on the public explorer.",
          },
        ]}
      />

      <h2 id="works">What works today</h2>
      <ul>
        <li>Connect wallet, portfolio, markets</li>
        <li>Send ETH and faucet stock tokens (public)</li>
        <li>Shield ETH + faucet stocks</li>
        <li>Unshield with a real zero-knowledge proof</li>
      </ul>

      <h2 id="not-yet">What does not work yet</h2>
      <ul>
        <li>Private transfer to another person</li>
        <li>Private trading / swaps</li>
        <li>Mainnet</li>
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
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
