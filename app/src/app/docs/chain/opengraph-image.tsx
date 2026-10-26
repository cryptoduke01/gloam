import { docsCard } from "@/lib/docsCard";
import { ChainsArt } from "@/lib/docsCardArt";
import { liveMainnetNames } from "@/lib/mainnet";

const title = "Networks";
/** The mainnets with a pool in: Base and Ethereum join the line once theirs are (lib/mainnet.ts). */
const subtitle = `One private core on ${liveMainnetNames()}.`;

export const alt = `Gloam docs: ${title}. ${subtitle}`;
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return docsCard({ title, subtitle, art: <ChainsArt /> });
}
