import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { VoteClient } from "@/components/vote/VoteClient";
import { voteStatus } from "@/lib/vote/core";
import { excludedForVote, findVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voteSummary } from "@/lib/vote/results";
import { voteTimeLine } from "@/lib/vote/timeLine";

// read per request: the published flag, preview and the live totals
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const vote = findVote(id);
  if (!vote) return { title: "Holder vote", robots: { index: false, follow: false } };
  const description = `${voteTimeLine(vote)}. ${vote.options.join(", ")}. A $GLOAM holder vote, signed without gas and published in full.`;
  return {
    title: vote.question,
    description,
    alternates: { canonical: `/vote/${vote.id}` },
    openGraph: { title: vote.question, description, url: `/vote/${vote.id}`, siteName: "Gloam", type: "website" },
    twitter: { card: "summary_large_image", title: vote.question, description, site: "@gloamtrade" },
    ...(vote.published ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function VotePage({ params }: Params) {
  const { id } = await params;
  const vote = findVote(id);
  if (!vote) notFound();
  const initial = await voteSummary(vote, snapshotFor(vote), excludedForVote(vote), undefined, { tolerateStore: true });
  // the other votes running now, so a voter can go on to the next one
  const others = visibleVotes()
    .filter((v) => v.id !== vote.id && ["open", "upcoming", "draft"].includes(voteStatus(v)))
    .map((v) => ({ id: v.id, question: v.question }));

  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />
      <main>
        {/* keyed by vote, so moving between votes never carries a choice or a wallet's standing across */}
        <VoteClient key={initial.id} initial={initial} others={others} />
      </main>
      <Footer />
    </div>
  );
}
