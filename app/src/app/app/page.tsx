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
      subtitle="Your wallet, your private vault, and everything you hold."
      subtitleTempo="Private stablecoin payments for people and agents. Your wallet, your sealed vault, one place."
    >
      <PortfolioView />
    </AppShell>
  );
}
