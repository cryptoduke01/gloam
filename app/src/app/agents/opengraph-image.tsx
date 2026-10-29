import { docsCard } from "@/lib/docsCard";
import { ChatArt } from "@/lib/docsCardArt";

const title = "Private money for AI agents";
const subtitle = "Fund an agent, let it pay and get paid, and keep its balance private.";

export const alt = `Gloam for agents: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <ChatArt />, section: "Agents" });
}
