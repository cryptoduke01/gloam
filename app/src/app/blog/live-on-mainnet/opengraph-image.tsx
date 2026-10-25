import { docsCard } from "@/lib/docsCard";
import { ChainsArt } from "@/lib/docsCardArt";

const title = "Private money, live on public chains";
const subtitle = "Gloam is live on Robinhood Chain and Tempo mainnet: private balances and payments in stablecoins.";

export const alt = `Gloam research: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <ChainsArt />, section: "Research" });
}
