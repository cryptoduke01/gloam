import { docsCard } from "@/lib/docsCard";
import { LedgerArt } from "@/lib/docsCardArt";

const title = "Gloam in numbers";
const subtitle = "What the vaults hold and how much they are used, on every mainnet, read live from the chain.";

export const alt = `Gloam stats: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <LedgerArt />, section: "Stats" });
}
