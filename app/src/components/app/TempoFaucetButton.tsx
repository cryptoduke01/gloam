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
  const { claim, status, ready, heldUsd } = useTempoFaucet();

  const held =
    heldUsd == null
      ? null
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(heldUsd);

  const label =
    status === "pending"
      ? "Getting test funds…"
      : status === "done"
        ? "Test funds added"
        : status === "error"
          ? "Faucet is busy, try again"
          : status === "enough"
            ? held
              ? `You already hold ${held} in test funds`
              : "You already have plenty of test funds"
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
      {status === "pending" && (
        <span
          aria-hidden
          className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {status === "done" && (
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" className="mr-1.5 text-sealed">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {label}
    </button>
  );
}
