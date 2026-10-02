import type { Metadata } from "next";
import { Web3Provider } from "@/components/app/Web3Provider";
import { TurnkeyEmbeddedProvider } from "@/components/app/TurnkeyEmbeddedProvider";
import { AppThemeScope } from "@/components/app/AppThemeScope";

export const metadata: Metadata = {
  title: {
    default: "Testnet",
    template: "%s · Gloam Testnet",
  },
  description:
    "The Gloam app on testnet: a private balance, private payments, payroll and proofs on Robinhood Chain and Tempo.",
};

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TurnkeyEmbeddedProvider>
      <AppThemeScope />
      <Web3Provider>{children}</Web3Provider>
    </TurnkeyEmbeddedProvider>
  );
}
