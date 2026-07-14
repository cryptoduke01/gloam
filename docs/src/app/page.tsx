import Link from "next/link";

const sections = [
  {
    href: "/intro",
    title: "What is Gloam",
    body: "Private money rails on Robinhood Chain — shield, move, trade.",
  },
  {
    href: "/chain",
    title: "Robinhood Chain",
    body: "Network details, chain ID, RPC, and how assets show up.",
  },
  {
    href: "/privacy-model",
    title: "Privacy model",
    body: "What shielded balances hide, what they do not, and threat notes.",
  },
  {
    href: "/product",
    title: "Product surface",
    body: "Shield, transfer, and trade flows as they ship on testnet.",
  },
];

export default function DocsHome() {
  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <a href="https://gloam.trade" className="text-sm font-medium text-white">
            ← gloam.trade
          </a>
          <span className="font-mono text-xs text-lime">docs</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-lime">
          Documentation
        </p>
        <h1
          className="mt-3 text-4xl tracking-tight text-white"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Gloam Docs
        </h1>
        <p className="mt-4 max-w-xl text-mute leading-relaxed">
          Private money on Robinhood Chain. This is the early docs surface —
          product truth as we ship, not vapor.
        </p>

        <div className="mt-12 grid gap-3">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-mute"
            >
              <h2 className="text-lg font-medium text-white">{s.title}</h2>
              <p className="mt-1.5 text-sm text-mute">{s.body}</p>
            </Link>
          ))}
        </div>

        <p className="mt-14 text-sm text-mute">
          Questions or corrections:{" "}
          <a
            href="https://x.com/gloamtrade"
            className="text-lime hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            @gloamtrade
          </a>
        </p>
      </main>
    </div>
  );
}
