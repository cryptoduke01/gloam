import { docsCard } from "@/lib/docsCard";
import { CodeArt } from "@/lib/docsCardArt";

const title = "Come build with Gloam at the NEAR hackathon";
const subtitle = "Private balances and payments for your app or agent. No circuits to write.";

export const alt = `Gloam: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <CodeArt />, section: "Announcement" });
}
