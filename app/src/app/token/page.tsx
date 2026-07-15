import type { Metadata } from "next";
import { TokenPage } from "@/components/TokenPage";
import { gloamToken, tokenStatusLabel } from "@/lib/gloamToken";

export const metadata: Metadata = {
  title: `${gloamToken.symbolDisplay} Token`,
  description: `${gloamToken.symbolDisplay} — ${gloamToken.tagline} Status: ${tokenStatusLabel()}. Official page for contract details when live.`,
  openGraph: {
    title: `${gloamToken.symbolDisplay} · Gloam`,
    description: gloamToken.tagline,
    url: "https://gloam.trade/token",
  },
  twitter: {
    title: `${gloamToken.symbolDisplay} · Gloam`,
    description: gloamToken.tagline,
  },
  alternates: { canonical: "https://gloam.trade/token" },
};

export default function TokenRoute() {
  return <TokenPage />;
}
