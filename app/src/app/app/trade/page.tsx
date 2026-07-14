import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TradeView } from "@/components/app/TradeView";

export const metadata: Metadata = {
  title: "Trade",
};

export default function TradePage() {
  return (
    <AppShell
      title="Trade"
      subtitle="Public swaps on testnet. Private trade (sealed size) is next."
    >
      <Suspense
        fallback={
          <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
            Loading markets…
          </div>
        }
      >
        <TradeView />
      </Suspense>
    </AppShell>
  );
}
