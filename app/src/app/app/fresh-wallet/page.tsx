import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { FreshWalletView } from "@/components/app/FreshWalletView";

export const metadata: Metadata = {
  title: "Fund a fresh wallet",
  description: "Fund a new wallet from your private balance on Robinhood Chain, with ETH for gas, ready to use Borro.",
  robots: { index: false, follow: false },
};

export default function FreshWalletPage() {
  return (
    <AppShell title="Fund a fresh wallet" subtitle="From your private balance, ready for Borro on Robinhood Chain.">
      <FreshWalletView />
    </AppShell>
  );
}
