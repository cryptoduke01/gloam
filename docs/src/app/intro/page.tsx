import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "What is Gloam" };

export default function IntroPage() {
  return (
    <DocArticle title="What is Gloam">
      <p>
        Gloam is private money infrastructure on{" "}
        <strong className="text-white">Robinhood Chain</strong>: shielded
        balances, private transfers, and private trading — starting with
        tokenized stocks and expanding to whatever is liquid.
      </p>
      <p>
        It is not a dark theme on a public DEX. The product goal is real
        cryptographic privacy for hold / move / trade, with a trench-simple
        interface.
      </p>
      <h2 className="mt-8 text-xl text-white">Core actions</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-white">Shield</strong> — assets enter a
          private balance set
        </li>
        <li>
          <strong className="text-white">Move</strong> — transfer without a clear
          public graph of sender and size
        </li>
        <li>
          <strong className="text-white">Trade</strong> — execute without
          broadcasting your full hand
        </li>
      </ul>
      <p className="mt-6">
        Status: marketing and docs live; protocol rails shipping toward
        testnet. Nothing here is a promise of mainnet dates.
      </p>
    </DocArticle>
  );
}

function DocArticle({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-sm text-mute hover:text-white">
            ← Docs home
          </Link>
          <a
            href="https://gloam.trade"
            className="text-sm text-mute hover:text-white"
          >
            gloam.trade
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14 text-[15px] leading-relaxed text-mute">
        <h1
          className="text-3xl tracking-tight text-white"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          {title}
        </h1>
        <div className="mt-8 space-y-4">{children}</div>
      </main>
    </div>
  );
}
