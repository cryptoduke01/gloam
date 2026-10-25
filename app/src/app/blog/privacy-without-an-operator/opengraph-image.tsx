import { docsCard } from "@/lib/docsCard";
import { CompareArt } from "@/lib/docsCardArt";

const title = "Privacy without an operator";
const subtitle = "Two ways to keep payments private, and who can still see inside each one.";

export const alt = `Gloam research: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <CompareArt />, section: "Research" });
}
