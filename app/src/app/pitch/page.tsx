import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, Mark } from "@/components/Logo";
import { SealedField } from "@/components/ui/SealedField";
import styles from "./pitch.module.css";

const PDF = "/pitch/Gloam-Pitch-Deck.pdf";
const TOTAL = 10;

export const metadata: Metadata = {
  title: "Pitch",
  description:
    "Gloam, a private way to trade everything onchain. Buy stocks and crypto on Robinhood Chain without showing the world your every move.",
  openGraph: {
    title: "Gloam · Pitch",
    description:
      "A private way to trade everything onchain. Stocks and crypto, private by design.",
    url: "https://gloam.trade/pitch",
    type: "website",
  },
  alternates: { canonical: "https://gloam.trade/pitch" },
};

/** One slide: a rounded panel with a deck footer (wordmark + page number). */
function Slide({
  n,
  label,
  dark = false,
  className = "",
  children,
}: {
  n: number;
  label: string;
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`Slide ${n}: ${label}`}
      className={`${styles.slide} ${dark ? `theme-dark gl-panel ${styles.dark}` : ""} ${className}`}
    >
      {children}
      <div className={styles.slideFoot} aria-hidden>
        <span>Gloam</span>
        <span className="tnum">
          {String(n).padStart(2, "0")} / {TOTAL}
        </span>
      </div>
    </section>
  );
}

export default function PitchPage() {
  return (
    <div className={styles.deck}>
      <header className={styles.bar}>
        <Logo />
        <div className={styles.barRight}>
          <Link href="/" className={`btn btn-quiet btn-sm ${styles.hideSm}`}>
            Back to site
          </Link>
          <a href={PDF} download className="btn btn-ink btn-sm">
            Download PDF
          </a>
        </div>
      </header>

      <main className={styles.stack}>
        {/* 1 · Cover */}
        <Slide n={1} label="Cover" dark className={styles.cover}>
          <SealedField drift />
          <div className={styles.inner}>
            <div className={styles.wordmark}>
              <Mark size={44} />
              <span>Gloam</span>
            </div>
            <h1 className={styles.coverTitle}>Private money on public chains</h1>
            <p className={styles.coverSub}>
              Hold, pay and run payroll in stablecoins without showing the world every amount.
            </p>
          </div>
        </Slide>

        {/* 2 · Problem */}
        <Slide n={2} label="The problem">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>The problem</p>
            <h2 className={styles.title}>Onchain, everyone can see everything</h2>
            <ul className={styles.bullets}>
              <li>
                Every trade you make is public. Anyone can see{" "}
                <b>what you bought, how much, and when</b>.
              </li>
              <li>
                The moment a big player moves, they get <b>copied and front run</b>{" "}
                before they even settle.
              </li>
              <li>
                There is still <b>no private way</b> to trade the stocks and tokens
                people actually want.
              </li>
            </ul>
          </div>
        </Slide>

        {/* 3 · Solution */}
        <Slide n={3} label="The solution">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>The solution</p>
            <h2 className={styles.title}>A private way to trade everything</h2>
            <p className={styles.lede}>
              Gloam lets you hold, send, and trade onchain in private. Your balances
              and your trades stay yours. You only become visible when <b>you</b> choose
              to.
            </p>
            <div className={styles.cards}>
              <div className={styles.card}>
                <h3>Private by default</h3>
                <p>Your money and moves stay off the public feed.</p>
              </div>
              <div className={styles.card}>
                <h3>Everything in one place</h3>
                <p>Stocks and crypto on the same private rails.</p>
              </div>
              <div className={styles.card}>
                <h3>You stay in control</h3>
                <p>Go public only when you decide to cash out.</p>
              </div>
            </div>
          </div>
        </Slide>

        {/* 4 · How it works */}
        <Slide n={4} label="How it works">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 className={styles.title}>Three simple steps</h2>
            <div className={styles.cards}>
              <div className={styles.card}>
                <h3>Deposit</h3>
                <p>Move money into your private balance. It leaves the public view.</p>
              </div>
              <div className={styles.card}>
                <h3>Send</h3>
                <p>Pay anyone privately. They receive it, the world does not see it.</p>
              </div>
              <div className={styles.card}>
                <h3>Trade</h3>
                <p>Buy and sell without broadcasting your size to the market.</p>
              </div>
            </div>
          </div>
        </Slide>

        {/* 5 · Why now */}
        <Slide n={5} label="Why now">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>Why now</p>
            <h2 className={styles.title}>Built where the market is heading</h2>
            <ul className={styles.bullets}>
              <li>
                Real world assets and tokenized stocks are moving onchain{" "}
                <b>faster every month</b>.
              </li>
              <li>
                Robinhood Chain is where those assets and a <b>huge retail audience</b>{" "}
                are landing.
              </li>
              <li>
                Privacy is the one thing missing, and the piece{" "}
                <b>nobody else is building</b>.
              </li>
            </ul>
          </div>
        </Slide>

        {/* 6 · Market size */}
        <Slide n={6} label="Market size">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>Market size</p>
            <h2 className={styles.title}>How big this gets</h2>
            <div className={styles.market}>
              <div className={styles.bullseyeWrap}>
                <svg className={styles.bullseye} viewBox="0 0 340 320" role="img" aria-label="TAM SAM SOM">
                  <circle cx="170" cy="160" r="150" fill="currentColor" fillOpacity="0.035" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
                  <circle cx="170" cy="160" r="99" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  <circle cx="170" cy="160" r="50" fill="var(--ink)" />
                  <text x="170" y="36" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="500" letterSpacing="1.5">TAM</text>
                  <text x="170" y="88" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="500" letterSpacing="1.5">SAM</text>
                  <text x="170" y="164" textAnchor="middle" fill="var(--on-ink)" fontSize="13" fontWeight="500" letterSpacing="1.5">SOM</text>
                </svg>
              </div>
              <div className={styles.legend}>
                <div className={`${styles.legendRow} ${styles.l1}`}>
                  <div className={styles.k}>TAM · $3T+ a year</div>
                  <div className={styles.v}>
                    All onchain trading, climbing as tokenized assets head toward $16T by
                    2030.
                  </div>
                </div>
                <div className={`${styles.legendRow} ${styles.l2}`}>
                  <div className={styles.k}>SAM · $250B a year</div>
                  <div className={styles.v}>
                    Privacy-sensitive trading on the EVM chains we serve, Robinhood Chain
                    and Ethereum.
                  </div>
                </div>
                <div className={`${styles.legendRow} ${styles.l3}`}>
                  <div className={styles.k}>SOM · $3B a year</div>
                  <div className={styles.v}>
                    Early capture in our first years, roughly $9M revenue at a 0.3% fee.
                  </div>
                </div>
              </div>
            </div>
            <p className={styles.note}>
              Directional estimates. Sources: DefiLlama onchain volume and BCG
              tokenization outlook.
            </p>
          </div>
        </Slide>

        {/* 7 · Traction */}
        <Slide n={7} label="Where we are">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>Where we are</p>
            <h2 className={styles.title}>Live and working today</h2>
            <ul className={styles.bullets}>
              <li>
                The full private flow is <b>live on our test network</b>: deposit,
                private send, cash out, and private trade.
              </li>
              <li>
                Private trade keeps <b>size sealed</b> in the vault. Test rates for now,
                real pricing next.
              </li>
              <li>
                Built fast, shipping weekly, with a{" "}
                <b>clear path to Ethereum and public launch</b>.
              </li>
            </ul>
          </div>
        </Slide>

        {/* 8 · Roadmap */}
        <Slide n={8} label="What's next">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>What&apos;s next</p>
            <h2 className={styles.title}>The path from here</h2>
            <div className={styles.road}>
              <div className={styles.step}>
                <div className={styles.when}>Now</div>
                <div className={styles.what}>
                  Private balances, send, cash out, private trade
                  <small>Live on the test network today.</small>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.when}>Next</div>
                <div className={styles.what}>
                  Real rates and production keys
                  <small>Leave test rates. Harden for real money.</small>
                </div>
              </div>
              <div className={`${styles.step} ${styles.hi}`}>
                <div className={styles.when}>
                  <span>Then</span>
                </div>
                <div className={styles.what}>
                  Expansion to Ethereum
                  <small>The largest onchain market and audience in crypto.</small>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.when}>Then</div>
                <div className={styles.what}>
                  Public launch
                  <small>Open to everyone, with real assets.</small>
                </div>
              </div>
            </div>
          </div>
        </Slide>

        {/* 9 · Opportunity */}
        <Slide n={9} label="The opportunity">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>The opportunity</p>
            <h2 className={styles.title}>A large market with an open lane</h2>
            <div className={styles.twoUp}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>The market</p>
                <h3>Growing fast</h3>
                <p>
                  Tokenized stocks and real world assets are moving onchain quickly. Every
                  serious trader eventually wants privacy, and almost{" "}
                  <b>no one offers it</b>.
                </p>
              </div>
              <div className={styles.card}>
                <p className={styles.cardLabel}>The raise</p>
                <h3>What it unlocks</h3>
                <p>
                  Capital takes us through{" "}
                  <b>security audit, mainnet launch, and expansion to Ethereum</b>,
                  the deepest market in crypto, with growth behind it.
                </p>
              </div>
            </div>
          </div>
        </Slide>

        {/* 10 · Close */}
        <Slide n={10} label="Close" dark className={styles.close}>
          <SealedField tone="edge" />
          <div className={styles.inner}>
            <h2 className={styles.closeTitle}>Let&apos;s build the private way to trade.</h2>
            <p className={styles.tagline}>Private by design.</p>
            <div className={styles.links}>
              <a href={PDF} download className="btn btn-ink btn-lg">
                Download the deck
              </a>
              <a href="https://gloam.trade/app/trade?path=sealed" className={styles.textLink}>
                Private trade (testnet) <span aria-hidden>↗</span>
              </a>
              <a href="https://gloam.trade/docs" className={styles.textLink}>
                Docs <span aria-hidden>↗</span>
              </a>
              <a href="https://x.com/gloamtrade" className={styles.textLink}>
                @gloamtrade <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
        </Slide>
      </main>

      <footer className={styles.pageFoot}>
        <span className={styles.b}>gloam.trade</span>
        <span>Private money on public chains</span>
      </footer>
    </div>
  );
}
