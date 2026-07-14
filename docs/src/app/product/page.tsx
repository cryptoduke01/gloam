import type { Metadata } from "next";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = { title: "Product surface" };

export default function ProductPage() {
  return (
    <DocShell title="Product surface" eyebrow="Ship order">
      <p>
        Host plan: marketing at{" "}
        <code className="text-lime">gloam.trade</code>, product at{" "}
        <code className="text-lime">testnet.gloam.trade</code> then{" "}
        <code className="text-lime">app.gloam.trade</code>, docs at{" "}
        <code className="text-lime">docs.gloam.trade</code>.
      </p>

      <h2 className="!mt-10 text-xl text-white">Vertical slices</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>Wallet connect on Robinhood Chain (testnet → mainnet)</li>
        <li>Public swap path so the app is never an empty shell</li>
        <li>Shield / private transfer vertical slice</li>
        <li>Private trade path for allowlisted stock tokens</li>
        <li>Guardrails, audits, anonymity-set health, mainnet gates</li>
      </ol>

      <h2 className="!mt-10 text-xl text-white">Principles</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>No mock fills that look like private success</li>
        <li>No claim that expands past the cryptography</li>
        <li>Trader surfaces first; parameters stay flexible after GTM</li>
      </ul>

      <p className="mt-8">
        Nothing is production-ready until guardrails, audits, and a real
        anonymity set exist. Follow{" "}
        <a
          href="https://x.com/gloamtrade"
          className="text-lime hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          @gloamtrade
        </a>{" "}
        for release notes.
      </p>
    </DocShell>
  );
}
