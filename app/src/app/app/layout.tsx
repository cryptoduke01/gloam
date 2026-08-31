import type { Metadata } from "next";
import { Web3Provider } from "@/components/app/Web3Provider";
import { TurnkeyEmbeddedProvider } from "@/components/app/TurnkeyEmbeddedProvider";

export const metadata: Metadata = {
  title: {
    default: "Testnet",
    template: "%s · Gloam Testnet",
  },
  description:
    "Gloam testnet, Trade Everything on Robinhood Privately. Portfolio, shield, move, trade.",
};

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TurnkeyEmbeddedProvider>
      <Web3Provider>{children}</Web3Provider>
    </TurnkeyEmbeddedProvider>
  );
}
