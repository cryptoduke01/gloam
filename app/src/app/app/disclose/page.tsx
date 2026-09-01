import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { DiscloseView } from "@/components/app/DiscloseView";

export const metadata: Metadata = {
  title: "Disclose",
};

export default function DisclosePage() {
  return (
    <AppShell
      title="Selective disclosure"
      subtitle="Prove a shielded balance to a party you choose, without revealing your identity or anything else."
    >
      <DiscloseView />
    </AppShell>
  );
}
