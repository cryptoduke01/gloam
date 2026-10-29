"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatGloam, shortAddress, whenPhrase, type Ballot } from "@/lib/vote/core";
import type { VoteSummary } from "@/lib/vote/results";
import { BallotCard, ClosingLine, HowItWorks, Recount, ResultsCard, ShareVoted, UpdatedAgo, Welcome, explorer } from "./VoteParts";
import { useLiveVotes, useMe, useVoteWallet } from "./voteHooks";

const WalletConnectSheet = dynamic(() => import("@/components/app/WalletConnectSheet").then((m) => m.WalletConnectSheet), { ssr: false });

const LIST_PAGE = 25;

/** /vote/<id>: one question, its live results, every vote cast, and what doesn't count. */
export function VoteClient({ initial, others = [] }: { initial: VoteSummary; others?: { id: string; question: string }[] }) {
  const wallet = useVoteWallet();
  const { me, failed, retry, recordBallot } = useMe(wallet.address);
  const { votes, updatedAt, refresh } = useLiveVotes([initial], initial.id);
  const s = votes[0] ?? initial;
  const standing = me?.votes[s.id] ?? null;
  const [ballots, setBallots] = useState<Ballot[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  // the list of every vote, refreshed with the totals
  useEffect(() => {
    let stop = false;
    fetch(`/api/vote/${s.id}/ballots`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !stop && Array.isArray(j?.ballots) && setBallots(j.ballots as Ballot[]))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [s.id, updatedAt]);

  const list = ballots ? [...ballots].sort((a, b) => (BigInt(b.weight) > BigInt(a.weight) ? 1 : BigInt(b.weight) < BigInt(a.weight) ? -1 : 0)) : null;
  const shown = list ? (showAll ? list : list.slice(0, LIST_PAGE)) : null;

  return (
    <>
      <section className="mx-auto max-w-[760px] px-5 pt-10 sm:px-7 sm:pt-16">
        <Link href="/vote" className="inline-flex min-h-10 items-center gap-2 text-[14px] text-mute transition-colors hover:text-foreground">
          <span aria-hidden>←</span> All holder votes
        </Link>
        <ClosingLine s={s} className="mt-3" />
      </section>

      <section className="mx-auto max-w-[760px] px-5 pt-6 sm:px-7" aria-label="Your ballot">
        {wallet.address && (
          <div className="mb-4">
            <Welcome
              key={wallet.address}
              me={me}
              address={wallet.address}
              chainId={wallet.chainId}
              failed={failed}
              onRetry={retry}
              onDisconnect={wallet.disconnect}
              focus={s.id}
              block={s.snapshotBlock}
            />
          </div>
        )}
        <BallotCard
          key={s.id}
          s={s}
          standing={standing}
          wallet={wallet}
          meFailed={failed}
          headingLevel="h1"
          onSigned={(b) => {
            recordBallot(s.id, b);
            void refresh();
          }}
        />
        {standing?.ballot && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <ShareVoted endPhrase={whenPhrase(s.end)} />
            <p className="text-[12.5px] text-mute sm:ml-2">The post doesn&apos;t include your wallet address.</p>
          </div>
        )}
      </section>

      {others.length > 0 && (
        <nav className="mx-auto max-w-[760px] px-5 pt-10 sm:px-7" aria-label="Other votes">
          <p className="text-[14px] text-mute">Also open. Each vote counts on its own.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={`/vote/${o.id}`} className="flex min-h-14 items-center justify-between gap-4 py-3 text-[15px] text-foreground transition-colors hover:text-soft">
                  <span className="min-w-0">{o.question}</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 sm:pt-24" aria-labelledby="results-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="results-title" className="t-display-m">
            Live results
          </h2>
          <UpdatedAgo at={updatedAt} />
        </div>
        <div className="mt-6">
          <ResultsCard s={s} mine={standing?.ballot ?? null} link={false} />
        </div>
      </section>

      <section className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 sm:pt-20" aria-labelledby="votes-title">
        <h2 id="votes-title" className="t-display-m">
          Every vote
        </h2>
        {list === null ? (
          <div className="gl-skeleton mt-6 h-24 rounded-[12px]" aria-hidden />
        ) : list.length === 0 ? (
          <p className="mt-6 rounded-[14px] border border-line px-5 py-6 text-[14.5px] text-mute">No votes yet. The first one shows here.</p>
        ) : (
          <>
            <ol className="mt-6 divide-y divide-line border-y border-line">
              {shown!.map((b) => (
                <li key={b.voter} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3.5 text-[14px]">
                  <a href={explorer(b.voter)} target="_blank" rel="noopener noreferrer" className="tnum min-w-0 truncate text-foreground underline-offset-4 hover:underline" title={b.voter}>
                    {shortAddress(b.voter)}
                  </a>
                  <span className="tnum text-right text-foreground">{formatGloam(b.weight)} GLOAM</span>
                  <span className="min-w-0 truncate text-mute">{b.choice}</span>
                  <span className="tnum truncate text-right text-[12.5px] text-faint" title={b.signature}>
                    sig {b.signature.slice(0, 10)}…
                  </span>
                </li>
              ))}
            </ol>
            {list.length > LIST_PAGE && (
              <button type="button" onClick={() => setShowAll((x) => !x)} className="btn btn-quiet btn-sm mt-4 min-h-10">
                {showAll ? "Show fewer" : `Show all ${list.length}`}
              </button>
            )}
          </>
        )}
        <div className="mt-6">
          <Recount votes={[s]} />
        </div>
      </section>

      <section className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 sm:pt-20">
        <HowItWorks block={s.snapshotBlock} />
      </section>

      <section id="not-counted" className="mx-auto max-w-[760px] scroll-mt-20 px-5 pb-20 pt-16 sm:px-7 sm:pb-28 sm:pt-20" aria-labelledby="excluded-title">
        <h2 id="excluded-title" className="t-display-m">
          Not counted
        </h2>
        <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-mute">
          GLOAM in these addresses carries no weight. The team&apos;s wallets hold no GLOAM to speak of; they are left out anyway.
        </p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {s.excluded.map((e) => (
            <li key={e.address} className="grid grid-cols-1 gap-1 py-3.5 text-[14px] sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
              <a href={explorer(e.address)} target="_blank" rel="noopener noreferrer" className="tnum w-fit text-foreground underline-offset-4 hover:underline" title={e.address}>
                {shortAddress(e.address)}
              </a>
              <span className="text-mute">{e.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {wallet.sheetOpen && <WalletConnectSheet open={wallet.sheetOpen} onClose={wallet.closeSheet} />}
    </>
  );
}
