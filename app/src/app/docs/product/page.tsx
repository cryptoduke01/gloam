import type { Metadata } from "next";
import { DocsLayout } from "@/components/DocsLayout";

export const metadata: Metadata = {
  title: "Product surface",
  description: "Gloam ship order — connect, public path, shield, private trade.",
};

export default function DocsProductPage() {
  return (
    <DocsLayout
      title="Product surface"
      lede="What ships, in what order, and what we refuse to fake."
      glance={[
        { label: "Marketing", value: "gloam.trade" },
        { label: "Docs", value: "/docs" },
        { label: "App (later)", value: "app.gloam.trade" },
        { label: "X", value: "@gloamtrade" },
      ]}
    >
      <h2>Host plan</h2>
      <ul>
        <li>
          <strong>Marketing</strong> — <code>gloam.trade</code>
        </li>
        <li>
          <strong>Docs</strong> — <code>gloam.trade/docs</code>
        </li>
        <li>
          <strong>Whitepaper</strong> — <code>gloam.trade/whitepaper</code>
        </li>
        <li>
          <strong>Testnet product</strong> — <code>gloam.trade/app</code>
        </li>
      </ul>

      <h2>Vertical slices</h2>
      <ol>
        <li>
          <strong>Live:</strong> wallet connect on Robinhood Chain testnet
          (46630), portfolio, markets catalog, product shell
        </li>
        <li>Public swap path so the app is never an empty shell</li>
        <li>Shield / private transfer vertical slice (real proofs)</li>
        <li>Private trade path for stock tokens and meme markets</li>
        <li>Guardrails, audits, anonymity-set health, mainnet gates</li>
      </ol>

      <h2>Principles</h2>
      <ul>
        <li>No mock fills that look like private success</li>
        <li>No claim that expands past the cryptography</li>
        <li>Stocks and memes on the same private rails</li>
      </ul>

      <p>
        Nothing is production-ready until guardrails, audits, and a real
        anonymity set exist. Follow{" "}
        <a
          href="https://x.com/gloamtrade"
          target="_blank"
          rel="noreferrer"
        >
          @gloamtrade
        </a>{" "}
        for release notes.
      </p>
    </DocsLayout>
  );
}
