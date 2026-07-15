import type { Metadata } from "next";
import { Suspense } from "react";
import { Web3Provider } from "@/components/app/Web3Provider";
import { TestnetGate } from "@/components/app/TestnetGate";

export const metadata: Metadata = {
  title: {
    default: "Testnet",
    template: "%s · Gloam Testnet",
  },
  description:
    "Gloam testnet — Trade Everything on Robinhood Privately. Portfolio, shield, move, trade.",
};

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Web3Provider>
      <Suspense
        fallback={
          <div className="flex min-h-full items-center justify-center bg-background text-sm text-mute">
            Loading…
          </div>
        }
      >
        <TestnetGate>{children}</TestnetGate>
      </Suspense>
    </Web3Provider>
  );
}
