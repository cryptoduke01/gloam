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
      subtitle="Wallet, appearance, network, and your vault backup."
    >
      <SettingsView />
    </AppShell>
  );
}
