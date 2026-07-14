import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { MarketsView } from "@/components/app/MarketsView";

export const metadata: Metadata = {
  title: "Markets",
};

export default function MarketsPage() {
  return (
    <AppShell
      title="Markets"
      subtitle="Robinhood stock tokens and equity marks. Private settlement next."
    >
      <MarketsView />
    </AppShell>
  );
}
