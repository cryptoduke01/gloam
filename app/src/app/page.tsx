import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";

const problems = [
  {
    title: "Public by default",
    body: "Every swap is a signal. Bots and copy traders read your book as it happens.",
  },
  {
    title: "Size gets farmed",
    body: "Show real size on a transparent AMM and the market prices you before settlement.",
  },
  {
    title: "No serious venue",
    body: "Retail apps list stock tokens. They will not ship private balances or private flow.",
  },
];

const steps = [
  {
    n: "01",
    title: "Shield",
    body: "Park assets in a shielded balance so the public graph stops tracking what you hold.",
    src: "/ascii/shield.png",
    tone: "lime" as const,
  },
  {
    n: "02",
    title: "Move",
    body: "Send between shielded parties without publishing sender, size, and timing on the open tape.",
    src: "/ascii/move.png",
    tone: "lime" as const,
  },
  {
    n: "03",
    title: "Trade",
    body: "Execute without showing your full hand. Stock tokens first on Robinhood Chain. Liquid markets next.",
    src: "/ascii/trade.png",
    tone: "lime" as const,
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0">
            <div className="ascii-fade absolute inset-0 opacity-50">
              <AsciiImage
                src="/ascii/IMG_1476.PNG"
                alt=""
                tone="paper"
                priority
                className="h-full min-h-[560px] w-full"
                sizes="100vw"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/92 to-ink/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/70" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12 lg:py-28">
            <div className="lg:col-span-7">
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-lime">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime" />
                Private money · Robinhood Chain
              </p>
              <h1 className="mt-5 font-display text-[2.5rem] leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.1rem]">
                Trade and move money privately onchain
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
                Shielded balances. Private transfers. Private trading. Stock
                tokens and liquid markets on Robinhood Chain, without printing
                your book to the public chain.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="#waitlist"
                  className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-ink hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                >
                  Launch testnet
                </Link>
                <a
                  href="https://docs.gloam.trade"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-white hover:border-mute"
                >
                  Read the docs
                </a>
              </div>
              <ul className="mt-10 flex flex-wrap gap-2">
                {["Shield", "Transfer", "Trade"].map((chip) => (
                  <li
                    key={chip}
                    className="rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-xs text-mute"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5">
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-line bg-panel shadow-[0_0_60px_rgba(200,255,0,0.04)]">
                <AsciiImage
                  src="/ascii/IMG_1476.PNG"
                  alt="Blind justice mark for private money"
                  tone="paper"
                  className="h-full w-full"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-panel/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
            <p className="text-sm text-mute">
              Settles in the Robinhood Chain ecosystem, where tokenized equities
              already live.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-lime">
              Chain ID 4663
            </p>
          </div>
        </section>

        <section id="product" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
              The problem
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight text-white sm:text-4xl">
              Transparent ledgers make transparent bags
            </h2>
            <p className="mt-4 max-w-2xl text-mute">
              Public AMMs and wallet trackers turned every move into content.
              Gloam is the private layer for hold, send, and trade when you do
              not want a live feed of your intent.
            </p>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {problems.map((p, i) => (
                <article
                  key={p.title}
                  className="overflow-hidden rounded-lg border border-line bg-panel"
                >
                  <div className="relative h-36 border-b border-line">
                    <AsciiImage
                      src={
                        i === 0
                          ? "/ascii/IMG_1478.PNG"
                          : i === 1
                            ? "/ascii/IMG_1477.JPG"
                            : "/ascii/neutral.png"
                      }
                      alt=""
                      tone={i < 2 ? "paper" : "white"}
                      className="h-full w-full"
                      sizes="33vw"
                    />
                  </div>
                  <div className="p-5 sm:p-6">
                    <h3 className="font-display text-xl text-white">{p.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                      {p.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl tracking-tight text-white sm:text-4xl">
              Shield. Move. Trade.
            </h2>
            <div className="mt-12 space-y-14 sm:mt-14 sm:space-y-16">
              {steps.map((s, i) => (
                <div
                  key={s.n}
                  className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
                    i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div>
                    <p className="font-mono text-xs text-lime">{s.n}</p>
                    <h3 className="mt-2 font-display text-3xl text-white">
                      {s.title}
                    </h3>
                    <p className="mt-4 max-w-md text-mute leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-line bg-panel">
                    <AsciiImage
                      src={s.src}
                      alt={`${s.title} illustration`}
                      tone={s.tone}
                      className="h-full w-full"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="chain" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-mute">
                Why Robinhood Chain
              </p>
              <h2 className="mt-3 font-display text-3xl tracking-tight text-white sm:text-4xl">
                Private rails where the equities already are
              </h2>
              <p className="mt-4 text-mute leading-relaxed">
                Robinhood Chain is an Arbitrum Orbit L2 for financial services
                and real-world assets, including stock tokens that trade past
                the equity close. Gloam adds shielded balances and private
                execution so size and strategy stay yours.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-mute">
                <li className="flex gap-2">
                  <span className="text-lime">→</span> Tokenized equity markets
                  around the clock
                </li>
                <li className="flex gap-2">
                  <span className="text-lime">→</span> EVM tooling and Uniswap
                  class liquidity paths
                </li>
                <li className="flex gap-2">
                  <span className="text-lime">→</span> Privacy as product, not a
                  skin on a public book
                </li>
              </ul>
            </div>
            <div className="relative aspect-[16/11] overflow-hidden rounded-lg border border-line">
              <AsciiImage
                src="/ascii/IMG_1475.JPG"
                alt=""
                tone="paper"
                className="h-full w-full"
                sizes="50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <p className="absolute bottom-5 left-5 right-5 font-display text-xl text-white sm:text-2xl">
                Private by construction. Public only when you exit.
              </p>
            </div>
          </div>
        </section>

        <section id="waitlist" className="border-b border-line bg-lime">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
            <div>
              <h2 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
                Testnet first. Mainnet when the rails hold.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-ink/75">
                We ship shield, transfer, and trade on Robinhood Chain in the
                open. No mock fills. No fake privacy.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://x.com/gloamtrade"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-white hover:opacity-90"
              >
                Follow @gloamtrade
              </a>
              <a
                href="https://docs.gloam.trade"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-md border border-ink/25 px-5 text-sm font-medium text-ink hover:bg-ink/5"
              >
                Docs
              </a>
            </div>
          </div>
        </section>

        <section className="relative h-36 overflow-hidden border-b border-line sm:h-48">
          <Image
            src="/ascii/optional-bleed.png"
            alt=""
            fill
            className="ascii-base object-cover"
            sizes="100vw"
          />
          <div
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{ backgroundColor: "#c8ff00", opacity: 0.5 }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink" />
        </section>
      </main>
      <Footer />
    </>
  );
}
