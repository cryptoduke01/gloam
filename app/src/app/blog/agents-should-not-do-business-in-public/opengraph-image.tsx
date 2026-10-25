import { docsCard } from "@/lib/docsCard";
import { JobArt } from "@/lib/docsCardArt";

const title = "Agents should not do business in public";
const subtitle = "Keep the job public. Make the money private.";

export const alt = `Gloam research: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <JobArt />, section: "Research" });
}
