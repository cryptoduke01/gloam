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
        { label: "X", value: "@gloamtrade" },
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
          <strong>Whitepaper</strong> — gloam.trade/whitepaper
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
            n: "○",
            title: "Sealed-size private trade",
            body: "Swap without broadcasting full size on the open book. Future step.",
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
        Open the app: <Link href="/app">/app</Link>. Follow{" "}
        <a href="https://x.com/gloamtrade" target="_blank" rel="noreferrer">
          @gloamtrade
        </a>{" "}
        for release notes.
      </p>
    </DocsLayout>
  );
}
