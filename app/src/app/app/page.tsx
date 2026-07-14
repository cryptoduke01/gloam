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
      subtitle="Wallet, stocks, and anything you shielded into the pool — testnet only."
    >
      <PortfolioView />
    </AppShell>
  );
}
