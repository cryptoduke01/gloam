import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy model" };

export default function PrivacyModelPage() {
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
          Privacy model
        </h1>
        <p className="mt-6">
          Robinhood Chain is a transparent L2. Privacy is not free with the
          chain — Gloam adds application-layer privacy (shielded balances /
          private execution paths) on top.
        </p>
        <h2 className="mt-10 text-xl text-white">What we aim to hide</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Balance amounts while shielded</li>
          <li>Private transfer graph between shielded parties</li>
          <li>Trade intent / size before and during private execution</li>
        </ul>
        <h2 className="mt-10 text-xl text-white">What may still leak</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Shield and unshield edges on the public chain</li>
          <li>Timing and amount correlation if the privacy set is small</li>
          <li>User error, malware, or legal process off-chain</li>
        </ul>
        <p className="mt-8">
          Implementation path: integrate or port a battle-tested EVM privacy
          system (Railgun-class) rather than inventing circuits from scratch on
          day one. Details ship as contracts land on testnet.
        </p>
      </main>
    </div>
  );
}
