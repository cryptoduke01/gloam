"use client";

import { useTempoFaucet } from "@/hooks/useTempoFaucet";

/**
 * Claims Tempo test stablecoins for the connected wallet and refetches balances.
 * Disabled until a wallet is connected. Callers pass their own look; without one
 * it renders as a small ghost pill.
 */
export function TempoFaucetButton({
  className = "btn btn-ghost btn-sm",
}: {
  className?: string;
}) {
  const { claim, status, ready } = useTempoFaucet();

  const label =
    status === "pending"
      ? "Funding…"
      : status === "done"
        ? "Funded. Balances updating…"
        : status === "error"
          ? "Faucet failed, try again"
          : "Get testnet funds →";

  return (
    <button
      type="button"
      onClick={claim}
      disabled={!ready || status === "pending"}
      aria-live="polite"
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
