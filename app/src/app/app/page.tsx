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
      subtitle="Your private balance, your wallet, and everything you hold."
      subtitleTempo="Private stablecoin payments for people and agents. Your private balance and your wallet, in one place."
    >
      <PortfolioView />
    </AppShell>
  );
}
