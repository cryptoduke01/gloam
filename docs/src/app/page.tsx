import Link from "next/link";

const sections = [
  {
    href: "/intro",
    title: "What is Gloam",
    body: "Private money on Robinhood Chain: shield, move, trade.",
  },
  {
    href: "/chain",
    title: "Robinhood Chain",
    body: "Network details, chain ID, RPC, and where assets live.",
  },
  {
    href: "/privacy-model",
    title: "Privacy model",
    body: "What shielded balances hide, what they do not, threat notes.",
  },
  {
    href: "/encryption",
    title: "How money is encrypted",
    body: "Clear value → commit → shielded note → private transfer.",
  },
  {
    href: "/product",
    title: "Product surface",
    body: "Ship order: connect, public path, shield, private trade.",
  },
  {
    href: "/whitepaper",
    title: "Whitepaper",
    body: "Thesis, architecture, threat model, and roadmap in full.",
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
      <main className="mx-auto max-w-3xl px-6 py-14">
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
          Trade Everything on Robinhood Privately. Stocks. Memes. This is the
          early surface of truth: what we build, what we hide, and what we
          refuse to promise.
        </p>

        <div className="mt-10 grid gap-3">
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

        <div className="mt-12 rounded-xl border border-lime/30 bg-panel p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
            Start here
          </p>
          <p className="mt-2 text-white" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
            Whitepaper
          </p>
          <p className="mt-2 text-sm text-mute leading-relaxed">
            The full argument: why public ledgers fail the serious trader, how
            shielded notes work on Robinhood Chain, and how Gloam ships without
            theatrical privacy.
          </p>
          <Link
            href="/whitepaper"
            className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-lime hover:underline"
          >
            Read the whitepaper →
          </Link>
        </div>

        <p className="mt-12 text-sm text-mute">
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
