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
      subtitle="Your private balance and your public wallet, side by side."
      subtitleTempo="Private stablecoin payments for people and agents. Your private balance and your public wallet, side by side."
    >
      <PortfolioView />
    </AppShell>
  );
}
