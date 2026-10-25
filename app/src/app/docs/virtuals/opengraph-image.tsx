import { docsCard } from "@/lib/docsCard";
import { WorkerArt } from "@/lib/docsCardArt";

const title = "Gloam for Virtuals agents";
const subtitle = "Private payments for agents built on GAME, and private payouts on ACP.";

export const alt = `Gloam docs: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <WorkerArt /> });
}
