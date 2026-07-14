import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { PortfolioView } from "@/components/app/PortfolioView";

export const metadata: Metadata = {
  title: "Portfolio",
};

export default function AppHomePage() {
  return (
    <AppShell
      title="Portfolio"
      subtitle="Public balances on Robinhood Chain testnet. Shielded notes when the rails hold."
    >
      <PortfolioView />
    </AppShell>
  );
}
