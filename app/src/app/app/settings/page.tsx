import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { SettingsView } from "@/components/app/SettingsView";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Wallet, network, faucet, and vault note backup."
    >
      <SettingsView />
    </AppShell>
  );
}
