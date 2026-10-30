import { docsCard } from "@/lib/docsCard";
import { LedgerArt } from "@/lib/docsCardArt";

const title = "Private commerce with commitments";
const subtitle = "Private payments that stay checkable against the root you already post.";

export const alt = `Gloam docs: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <LedgerArt /> });
}
