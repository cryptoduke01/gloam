import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Robinhood Chain" };

export default function ChainPage() {
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
          Robinhood Chain
        </h1>
        <p className="mt-6">
          Gloam targets Robinhood Chain, an Arbitrum Orbit L2 optimized for
          financial services and real-world assets (including stock tokens).
        </p>
        <dl className="mt-8 space-y-4 font-mono text-sm">
          <div>
            <dt className="text-mute">Mainnet chain ID</dt>
            <dd className="text-lime">4663</dd>
          </div>
          <div>
            <dt className="text-mute">Testnet chain ID</dt>
            <dd className="text-white">46630</dd>
          </div>
          <div>
            <dt className="text-mute">Native gas</dt>
            <dd className="text-white">ETH</dd>
          </div>
          <div>
            <dt className="text-mute">Public RPC (rate limited)</dt>
            <dd className="break-all text-white">
              https://rpc.mainnet.chain.robinhood.com
            </dd>
          </div>
        </dl>
        <p className="mt-8">
          Prefer Alchemy / QuickNode for production. Official docs:{" "}
          <a
            href="https://docs.robinhood.com/chain/connecting/"
            className="text-lime hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            docs.robinhood.com/chain
          </a>
          .
        </p>
      </main>
    </div>
  );
}
