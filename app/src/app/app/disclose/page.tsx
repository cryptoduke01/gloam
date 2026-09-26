import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { DiscloseView } from "@/components/app/DiscloseView";

export const metadata: Metadata = {
  title: "Prove",
};

export default function DisclosePage() {
  return (
    <AppShell
      title="Prove what you hold"
      subtitle="Show someone you hold a balance, without revealing your identity or anything else."
    >
      <DiscloseView />
    </AppShell>
  );
}
