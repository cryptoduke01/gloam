import { docsCard } from "@/lib/docsCard";
import { SendArt } from "@/lib/docsCardArt";

const title = "Gloam is live on Tempo";
const subtitle = "Private balances and payments on the payments-first stablecoin chain.";

export const alt = `Gloam research: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <SendArt />, section: "Research" });
}
