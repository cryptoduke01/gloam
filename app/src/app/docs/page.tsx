import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram, PoolPicture } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Gloam docs: private money on public chains, on Robinhood Chain and Tempo, explained simply. Private balances, payments, payroll, and what works on testnet.",
};

export default function DocsOverviewPage() {
  return (
    <DocsLayout
      title="Docs"
      lede="Private money on public chains, explained without the jargon wall. Start here."
    >
      <h2 id="what">What is Gloam?</h2>
      <p>
        Stablecoins are becoming how businesses and AI agents pay each other,
        and every one of those payments is public. Gloam makes them private,
        and lets the payer prove exactly what someone needs to see. Private by
        default, provable on demand.
      </p>
      <p>
        It runs on <strong>Tempo</strong> and <strong>Robinhood Chain</strong>{" "}
        testnets. You put money into a shared vault (“shield”), pay privately
        inside it, and cash out with a real proof. Proofs are made on your
        device, and nobody else holds a key. See{" "}
        <Link href="/docs/compare">how Gloam compares</Link>.
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
          <Link href="/app/vault?tab=shield">Shield</Link> a tiny amount of testnet funds.
        </li>
        <li>
          <Link href="/app/vault?tab=move">Move</Link> to pay a tag or cash out. A browser
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
        <li>
          <Link href="/docs/proofs">Proof of funds and proof of payment</Link>:
          show you hold at least an amount, or that you were paid, without
          showing your balance
        </li>
        <li>
          <Link href="/docs/payroll">Private payroll</Link>: upload a list and
          pay everyone from your private balance, once or on a{" "}
          <Link href="/docs/payroll#schedules">schedule</Link> with a cap per run
        </li>
        <li>Payment requests: a link or QR that fills in what to pay you</li>
        <li>
          <Link href="/transparency">Transparency</Link>: what anyone can see
          about the vault, live from the chain
        </li>
        <li>
          <Link href="/docs/agents">Agent spending limits</Link> in the MCP
          server: caps per payment and per day, allowed payees, expiry
        </li>
        <li>The Gloam relay, which keeps your wallet off the record</li>
        <li>Note backup (optional lock) in Settings</li>
      </ul>

      <h2 id="not-yet">What does not work yet</h2>
      <ul>
        <li>
          <Link href="/docs/sealed-trade">Private trade</Link>: built, and
          switched off on-chain while we build a new engine for it. Stock
          tokens can already be held and sent privately
        </li>
        <li>
          <Link href="/docs/data">On-chain price oracles</Link> (no Chainlink /
          Pyth / RedStone wired)
        </li>
        <li>
          <Link href="/docs/production">Production ceremony keys / mainnet</Link>
        </li>
        <li>Ethereum expansion (roadmap)</li>
      </ul>

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
          <Link href="/docs/compare">How Gloam compares</Link>
        </li>
        <li>
          <Link href="/docs/production">Production gate</Link>
        </li>
        <li>
          <Link href="/docs/sealed-trade">Private trade</Link>
        </li>
        <li>
          <Link href="/docs/data">Prices, data &amp; oracles</Link>
        </li>
        <li>
          <Link href="/whitepaper">Whitepaper</Link>
        </li>
      </ul>
    </DocsLayout>
  );
}
