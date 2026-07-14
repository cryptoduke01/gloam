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
      subtitle="Stock tokens on Robinhood. Private execution when the book is sealed."
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
