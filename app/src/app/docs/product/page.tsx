import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = {
  title: "What ships when",
  description:
    "Gloam product status — what is live on testnet, what is next, what we will not fake.",
};

export default function DocsProductPage() {
  return (
    <DocsLayout
      title="What ships when"
      lede="Status board for the product. Updated as features actually land."
      glance={[
        { label: "App", value: "gloam.trade/app" },
        { label: "Docs", value: "/docs" },
        { label: "Paper", value: "/whitepaper" },
        { label: "Token", value: "/token · not live" },
        { label: "X", value: "@gloamtrade" },
      ]}
      quickLinks={[
        { href: "/app", label: "Open testnet" },
        { href: "/token", label: "$GLOAM token" },
        { href: "/whitepaper", label: "Whitepaper" },
        { href: "https://x.com/gloamtrade", label: "@gloamtrade" },
      ]}
    >
      <h2>Where things live</h2>
      <ul>
        <li>
          <strong>Marketing</strong> — gloam.trade
        </li>
        <li>
          <strong>App</strong> — gloam.trade/app
        </li>
        <li>
          <strong>Docs</strong> — gloam.trade/docs
        </li>
        <li>
          <strong>Testnet guide</strong> —{" "}
          <Link href="/docs/testnet">gloam.trade/docs/testnet</Link>
        </li>
        <li>
          <strong>Whitepaper</strong> — gloam.trade/whitepaper
        </li>
        <li>
          <strong>$GLOAM</strong> —{" "}
          <Link href="/token">gloam.trade/token</Link> (prepared, not launched)
        </li>
      </ul>

      <h2>Status (honest)</h2>
      <FlowDiagram
        title="Ship board"
        steps={[
          {
            n: "●",
            title: "Public path",
            body: "Connect, portfolio, send ETH, send faucet stocks, markets.",
          },
          {
            n: "●",
            title: "Shield",
            body: "Deposit ETH and faucet stocks into the live Poseidon pool.",
          },
          {
            n: "●",
            title: "Private send",
            body: "Pay someone inside the vault. Share a compact payment code (optional passphrase lock).",
          },
          {
            n: "●",
            title: "Cash out",
            body: "Withdraw to your open wallet with a real browser proof.",
          },
          {
            n: "●",
            title: "Vault trade adapter",
            body: "From vault: cash out → public DEX swap → re-shield. Hold private; swap edge still public.",
          },
          {
            n: "●",
            title: "Sealed-size private trade",
            body: "Vault-settled private trade on testnet (display-mark rates, dev keys). See sealed-trade docs.",
          },
          {
            n: "○",
            title: "Real rates + production keys",
            body: "Oracle-bound pricing, multi-party ceremony, audit. Blocked until the production gate is green.",
          },
          {
            n: "○",
            title: "Ethereum expansion",
            body: "Same private rails on Ethereum after RH testnet rails are solid.",
          },
          {
            n: "○",
            title: "$GLOAM token",
            body: "Ticker prepared at /token. No live contract until product, trust, and utility gates close.",
          },
        ]}
      />

      <h2>Rules we will not break</h2>
      <ul>
        <li>No fake “private success” screens</li>
        <li>No claims past what the contracts actually do</li>
        <li>Testnet until audits and production keys exist for real money</li>
      </ul>

      <p>
        Open the app: <Link href="/app">/app</Link> ·{" "}
        <Link href="/docs/production">Production gate</Link> ·{" "}
        <Link href="/docs/sealed-trade">Sealed trade</Link>. Follow{" "}
        <a href="https://x.com/gloamtrade" target="_blank" rel="noreferrer">
          @gloamtrade
        </a>{" "}
        for release notes.
      </p>
    </DocsLayout>
  );
}
