import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { VoteHub } from "@/components/vote/VoteHub";
import { excludedForVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voteSummary } from "@/lib/vote/results";

// read per request: the published flag and the live totals
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Holder votes",
  description: "$GLOAM holders vote on what Gloam builds next. Open votes, weighted by public balances, with every signature published.",
  alternates: { canonical: "/vote" },
};

export default async function VotesPage() {
  const initial = await Promise.all(
    visibleVotes().map((v) => voteSummary(v, snapshotFor(v), excludedForVote(v), undefined, { tolerateStore: true })),
  );
  return (
    <div className="relative min-h-screen bg-panel text-foreground">
      <Header />
      <main>
        <VoteHub initial={initial} />
      </main>
      <Footer />
    </div>
  );
}
