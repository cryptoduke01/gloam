import { headlineCard } from "@/lib/xray/card";

export const alt = "Your wallet is a public receipt.";
export { size, contentType } from "@/lib/docsCard";

export default function OpenGraphImage() {
  return headlineCard();
}
