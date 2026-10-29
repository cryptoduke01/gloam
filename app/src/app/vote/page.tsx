import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { formatGloam, formatUtc } from "@/lib/vote/core";
import { excludedForVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voteSummary, type VoteSummary } from "@/lib/vote/results";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Holder votes",
  description: "$GLOAM holders vote on what Gloam does next. Open votes, counted from public balances, with every signature published.",
  alternates: { canonical: "/vote" },
};

function statusLine(s: VoteSummary): string {
  if (s.draft) return "Draft, not published";
  if (s.status === "upcoming") return `Opens ${formatUtc(s.start)}`;
  if (s.status === "open") return `Open until ${formatUtc(s.end)}`;
  return `Closed ${formatUtc(s.end)}`;
}

function VoteCard({ s }: { s: VoteSummary }) {
  return (
    <Link href={`/vote/${s.id}`} className="gl-card lift block p-5 transition-colors sm:p-7">
      <span className={`text-[13.5px] ${s.draft ? "text-warn" : "text-mute"}`}>{statusLine(s)}</span>
      <span className="mt-2 block text-[20px] leading-snug tracking-[-0.01em] text-foreground [text-wrap:balance] sm:text-[22px]">
        {s.question}
      </span>
      <span className="mt-5 flex flex-col gap-3">
        {s.totals.options.map((o) => (
          <span key={o.option} className="block">
            <span className="flex items-baseline justify-between gap-4 text-[14px]">
              <span className="min-w-0 text-soft">{o.label}</span>
              <span className="tnum shrink-0 text-foreground">{o.percent}%</span>
            </span>
            <span aria-hidden className="mt-1.5 block h-[3px] rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${o.percent}%` }} />
            </span>
          </span>
        ))}
      </span>
      <span className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="tnum text-[13px] text-mute">
          {s.totals.wallets} {s.totals.wallets === 1 ? "wallet" : "wallets"}, {formatGloam(s.totals.weight)} GLOAM
        </span>
        <span className="inline-flex items-center gap-1.5 text-[14px] text-foreground">
          {s.accepting ? "Vote" : s.status === "closed" ? "See the result" : "See the vote"} <span aria-hidden>→</span>
        </span>
      </span>
    </Link>
  );
}

export default async function VotesPage() {
  const summaries = await Promise.all(
    visibleVotes().map((v) => voteSummary(v, snapshotFor(v), excludedForVote(v), undefined, { tolerateStore: true })),
  );
  const open = summaries.filter((s) => s.status === "open" || s.status === "upcoming" || s.draft);
  const past = summaries.filter((s) => !open.includes(s));
  const sameEnd = open.length > 1 && open.every((s) => s.end === open[0]!.end);

  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />
      <main className="mx-auto max-w-[760px] px-5 pb-20 pt-12 sm:px-7 sm:pb-28 sm:pt-20">
        <p className="text-[14px] text-mute">$GLOAM</p>
        <h1 className="t-display-l mt-5">Holder votes</h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-soft sm:text-[17px]">
          Holders vote on what Gloam does next. Votes run in the open: each one is a free signature, weighted by your $GLOAM balance.
        </p>

        {summaries.length === 0 ? (
          <div className="mt-12 border-y border-line py-8">
            <p className="text-[17px] text-foreground">No vote is open right now.</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-mute">The next one is announced on X @gloamtrade and in the Telegram group.</p>
            <Link href="/token#roadmap" className="gl-arrowlink mt-6 inline-flex">
              See the roadmap <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="mt-12" aria-labelledby="open-title">
                <h2 id="open-title" className="text-[15px] text-foreground">
                  {open.length === 1 ? "Open now" : `${open.length} votes open now`}
                </h2>
                {open.length > 1 && (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-mute">
                    Each one counts on its own, so you can vote in any or all of them
                    {sameEnd ? `, until ${formatUtc(open[0]!.end)}` : ""}.
                  </p>
                )}
                <ul className="mt-5 flex flex-col gap-4">
                  {open.map((s) => (
                    <li key={s.id}>
                      <VoteCard s={s} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {past.length > 0 && (
              <section className="mt-14" aria-labelledby="past-title">
                <h2 id="past-title" className="text-[15px] text-foreground">
                  Past votes
                </h2>
                <ul className="mt-5 flex flex-col gap-4">
                  {past.map((s) => (
                    <li key={s.id}>
                      <VoteCard s={s} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
