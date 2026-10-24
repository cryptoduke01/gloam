import { docsCard } from "@/lib/docsCard";
import { PaperArt } from "@/lib/docsCardArt";

const title = "Research";
const subtitle = "Why money on public chains needs privacy, and what we ship.";

export const alt = `Gloam research: ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <PaperArt />, section: "Research" });
}
