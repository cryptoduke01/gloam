import { votesCard } from "@/lib/vote/voteCard";

export const alt = "$GLOAM holder votes: help decide what Gloam builds next";
export { size, contentType } from "@/lib/docsCard";
// the close line turns into "Results are in" when the votes end
export const revalidate = 300;

export default function OpenGraphImage() {
  return votesCard();
}
