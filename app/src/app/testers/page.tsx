import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { paidSpotsLeft, testersCap } from "@/lib/testers";
import { TestersForm } from "./TestersForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Become a tester",
  description:
    "Join the private Gloam testers group. Use private payments on Tempo and Robinhood Chain testnet, tell us what breaks, and get rewarded.",
  alternates: { canonical: "https://gloam.trade/testers" },
};

const PERKS = [
  "A private Telegram group with the team",
  "New features before anyone else",
  "A direct say in what we fix before mainnet",
];

export default async function TestersPage() {
  // if storage can't be read, assume paid spots are full so nobody is promised a reward by mistake
  const paidFull = (await paidSpotsLeft().catch(() => 0)) === 0;
  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />

      <main className="mx-auto max-w-[1240px] px-5 pb-8 pt-14 sm:px-7 sm:pt-20">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_minmax(0,540px)] lg:gap-20">
          <div className="lg:sticky lg:top-28">
            <p className="t-label">Testers</p>
            <h1 className="t-display-xl mt-5 max-w-[11ch]">Help us test Gloam.</h1>
            <p className="mt-6 max-w-[44ch] text-[16px] leading-relaxed text-soft sm:text-[17px]">
              Gloam is live on Tempo and Robinhood Chain testnet. Use it, push it, and tell us what breaks before
              mainnet.
            </p>
            <ul className="mt-9 flex flex-col gap-3.5">
              {PERKS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] text-soft">
                  <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-sealed" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-9 text-[13px] text-mute">Testnet only. You test with play money.</p>
          </div>

          <div className="gl-card p-6 sm:p-8">
            <TestersForm paidFull={paidFull} paidSpots={testersCap()} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
