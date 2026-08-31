import type { Metadata } from "next";
import Link from "next/link";
import styles from "./pitch.module.css";

const PDF = "/pitch/Gloam-Pitch-Deck.pdf";

function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      style={{ flex: "none" }}
    >
      <rect width="32" height="32" rx="9" fill="#121316" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#f4f3ef" />
    </svg>
  );
}

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

export default function PitchPage() {
  return (
    <div className={styles.deck}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          <Mark size={34} />
          <span>Gloam</span>
        </Link>
        <div className={styles.barRight}>
          <Link href="/" className={styles.ghost}>
            Back to site
          </Link>
          <a href={PDF} download className={styles.download}>
            Download PDF
          </a>
        </div>
      </header>

      <main>
        {/* 1 · Cover */}
        <section className={`${styles.slide} ${styles.cover}`} style={{ position: "relative" }}>
          <div className={styles.glow} aria-hidden />
          <div className={styles.inner} style={{ position: "relative" }}>
            <div className={styles.wordmark}>
              <Mark size={60} />
              <span>Gloam</span>
            </div>
            <h1 className={styles.coverTitle}>Trade Everything on Robinhood Privately</h1>
            <p className={styles.coverSub}>
              Buy stocks and crypto onchain without showing the world your every move.
            </p>
          </div>
        </section>

        {/* 2 · Problem */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>The problem</div>
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
        </section>

        {/* 3 · Solution */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>The solution</div>
            <h2 className={styles.title}>A private way to trade everything</h2>
            <p className={styles.lede}>
              Gloam lets you hold, send, and trade onchain in private. Your balances
              and your trades stay yours. You only become visible when <b>you</b> choose
              to.
            </p>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.num}>01</div>
                <h3>Private by default</h3>
                <p>Your money and moves stay off the public feed.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.num}>02</div>
                <h3>Everything in one place</h3>
                <p>Stocks and crypto on the same private rails.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.num}>03</div>
                <h3>You stay in control</h3>
                <p>Go public only when you decide to cash out.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4 · How it works */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>How it works</div>
            <h2 className={styles.title}>Three simple steps</h2>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.num}>Step 01</div>
                <h3>Deposit</h3>
                <p>Move money into your private balance. It leaves the public view.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.num}>Step 02</div>
                <h3>Send</h3>
                <p>Pay anyone privately. They receive it, the world does not see it.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.num}>Step 03</div>
                <h3>Trade</h3>
                <p>Buy and sell without broadcasting your size to the market.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5 · Why now */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>Why now</div>
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
        </section>

        {/* 6 · Market size */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>Market size</div>
            <h2 className={styles.title}>How big this gets</h2>
            <div className={styles.market}>
              <div className={styles.bullseyeWrap}>
                <svg className={styles.bullseye} viewBox="0 0 340 320" role="img" aria-label="TAM SAM SOM">
                  <circle cx="170" cy="160" r="150" fill="rgba(59,55,102,0.06)" stroke="rgba(59,55,102,0.28)" strokeWidth="1.5" />
                  <circle cx="170" cy="160" r="99" fill="rgba(59,55,102,0.12)" stroke="rgba(59,55,102,0.5)" strokeWidth="1.5" />
                  <circle cx="170" cy="160" r="50" fill="#3b3766" />
                  <text x="170" y="36" textAnchor="middle" fill="#3b3766" fontSize="13" fontWeight="700" letterSpacing="1.5">TAM</text>
                  <text x="170" y="88" textAnchor="middle" fill="#3b3766" fontSize="13" fontWeight="700" letterSpacing="1.5">SAM</text>
                  <text x="170" y="165" textAnchor="middle" fill="#f4f3ef" fontSize="14" fontWeight="700" letterSpacing="1.5">SOM</text>
                </svg>
              </div>
              <div className={styles.legend}>
                <div className={styles.legendRow} style={{ borderLeftColor: "#3b3766" }}>
                  <div className={styles.k}>TAM · $3T+ a year</div>
                  <div className={styles.v}>
                    All onchain trading, climbing as tokenized assets head toward $16T by
                    2030.
                  </div>
                </div>
                <div className={styles.legendRow} style={{ borderLeftColor: "rgba(59,55,102,0.5)" }}>
                  <div className={styles.k}>SAM · $250B a year</div>
                  <div className={styles.v}>
                    Privacy-sensitive trading on the EVM chains we serve, Robinhood Chain
                    and Ethereum.
                  </div>
                </div>
                <div className={styles.legendRow} style={{ borderLeftColor: "rgba(59,55,102,0.28)" }}>
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
        </section>

        {/* 7 · Traction */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>Where we are</div>
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
        </section>

        {/* 8 · Roadmap */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>What&apos;s next</div>
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
                <div className={styles.when}>Then</div>
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
        </section>

        {/* 9 · Opportunity */}
        <section className={styles.slide}>
          <div className={styles.inner}>
            <div className={styles.eyebrow}>The opportunity</div>
            <h2 className={styles.title}>A large market with an open lane</h2>
            <div className={styles.twoUp}>
              <div className={styles.card}>
                <div className={styles.num}>The market</div>
                <h3>Growing fast</h3>
                <p>
                  Tokenized stocks and real world assets are moving onchain quickly. Every
                  serious trader eventually wants privacy, and almost{" "}
                  <b style={{ color: "#121316" }}>no one offers it</b>.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.num}>The raise</div>
                <h3>What it unlocks</h3>
                <p>
                  Capital takes us through{" "}
                  <b style={{ color: "#121316" }}>
                    security audit, mainnet launch, and expansion to Ethereum
                  </b>
                 , the deepest market in crypto, with growth behind it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 10 · Close */}
        <section className={`${styles.slide} ${styles.close}`}>
          <div className={styles.inner}>
            <div className={styles.rule} />
            <h2 className={styles.closeTitle}>Let&apos;s build the private way to trade.</h2>
            <p className={styles.tagline}>Black. Lime. Private by design.</p>
            <div className={styles.links}>
              <a href={PDF} download>
                Download the deck
              </a>
              <a href="https://gloam.trade/app/trade?path=sealed">
                Private trade (testnet)
              </a>
              <a href="https://gloam.trade/docs">Docs</a>
              <a href="https://x.com/gloamtrade">@gloamtrade</a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.pageFoot}>
        <span className={styles.b}>gloam.trade</span>
        <span>Trade Everything on Robinhood Privately</span>
      </footer>
    </div>
  );
}
