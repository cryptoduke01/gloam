import { findVote } from "@/lib/vote/registry";
import { voteCard } from "@/lib/vote/voteCard";

export const alt = "A $GLOAM holder vote on Gloam";
export { size, contentType } from "@/lib/docsCard";
// the close line turns into "Results are in" when the vote ends
export const revalidate = 300;

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return voteCard(findVote(id));
}
