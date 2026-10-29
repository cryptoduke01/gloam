import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { formatUtc, voteStatus } from "@/lib/vote/core";
import { visibleVotes } from "@/lib/vote/registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Holder votes",
  description: "$GLOAM holders vote on what Gloam does next. Open votes, counted from public balances, with every signature published.",
  alternates: { canonical: "/vote" },
};

export default function VotesPage() {
  const votes = visibleVotes();

  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />
      <main className="mx-auto max-w-[760px] px-5 pb-20 pt-12 sm:px-7 sm:pb-28 sm:pt-20">
        <p className="text-[14px] text-mute">$GLOAM</p>
        <h1 className="t-display-l mt-5">Holder votes</h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-soft sm:text-[17px]">
          Holders vote on what Gloam does next. Votes run in the open: each one is a free signature, weighted by your $GLOAM balance.
        </p>

        {votes.length === 0 ? (
          <div className="mt-12 border-y border-line py-8">
            <p className="text-[17px] text-foreground">No vote is open right now.</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-mute">The next one is announced on X @gloamtrade and in the Telegram group.</p>
            <Link href="/token#roadmap" className="gl-arrowlink mt-6 inline-flex">
              See the roadmap <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <ul className="mt-12 flex flex-col gap-3">
            {votes.map((v) => {
              const status = voteStatus(v);
              const line =
                status === "draft"
                  ? "Draft, not published"
                  : status === "upcoming"
                    ? `Opens ${formatUtc(v.start)}`
                    : status === "open"
                      ? `Open until ${formatUtc(v.end)}`
                      : `Closed ${formatUtc(v.end)}`;
              return (
                <li key={v.id}>
                  <Link href={`/vote/${v.id}`} className="gl-card lift block p-5 transition-colors sm:p-7">
                    <span className={`text-[13.5px] ${status === "draft" ? "text-warn" : "text-mute"}`}>{line}</span>
                    <span className="mt-2 block text-[20px] leading-snug tracking-[-0.01em] text-foreground">{v.question}</span>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] text-foreground">
                      {status === "open" ? "Vote" : "See the result"} <span aria-hidden>→</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
