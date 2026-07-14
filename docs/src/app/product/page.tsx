import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Product surface" };

export default function ProductPage() {
  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-sm text-mute hover:text-white">
            ← Docs home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14 text-[15px] leading-relaxed text-mute">
        <h1
          className="text-3xl tracking-tight text-white"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Product surface
        </h1>
        <p className="mt-6">
          Host plan: marketing at{" "}
          <code className="text-lime">gloam.trade</code>, product at{" "}
          <code className="text-lime">testnet.gloam.trade</code> then{" "}
          <code className="text-lime">app.gloam.trade</code>, docs here.
        </p>
        <h2 className="mt-10 text-xl text-white">Ship order</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>Wallet connect on Robinhood Chain (testnet → mainnet)</li>
          <li>Public swap path so the app is never empty</li>
          <li>Shield / private transfer vertical slice</li>
          <li>Private trade path for allowlisted stock tokens</li>
        </ol>
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
      </main>
    </div>
  );
}
