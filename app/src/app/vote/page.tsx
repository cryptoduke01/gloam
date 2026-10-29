import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { VoteHub } from "@/components/vote/VoteHub";
import { excludedForVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voteSummary } from "@/lib/vote/results";

// read per request: the published flag and the live totals
export const dynamic = "force-dynamic";

const TITLE = "Holder votes · Gloam";
const DESCRIPTION =
  "$GLOAM holders vote on what Gloam builds next: private swaps, the next chain and the first integrations. Weighted by public balances, signed without gas, every vote published.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vote" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/vote", siteName: "Gloam", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, site: "@gloamtrade" },
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
