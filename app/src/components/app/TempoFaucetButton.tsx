"use client";

import { useTempoFaucet } from "@/hooks/useTempoFaucet";

/**
 * Claims Tempo test stablecoins for the connected wallet and refetches balances.
 * Disabled until a wallet is connected.
 */
export function TempoFaucetButton({ className = "" }: { className?: string }) {
  const { claim, status, ready } = useTempoFaucet();

  const label =
    status === "pending"
      ? "Funding…"
      : status === "done"
        ? "Funded ✓ balances updating"
        : status === "error"
          ? "Faucet failed, try again"
          : "Get testnet funds →";

  return (
    <button
      type="button"
      onClick={claim}
      disabled={!ready || status === "pending"}
      className={className}
      title={
        ready
          ? "Fund your wallet with test stablecoins"
          : "Connect a wallet to claim test stablecoins"
      }
    >
      {label}
    </button>
  );
}
