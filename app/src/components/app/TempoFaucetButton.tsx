"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useNetwork } from "./NetworkProvider";
import { fundTempoAddress } from "@/lib/tempoFaucet";

type Status = "idle" | "pending" | "done" | "error";

/**
 * Claims Tempo test stablecoins for the connected wallet via tempo_fundAddress,
 * then refetches balances so the new holdings appear. Falls back to the faucet
 * guide when there is no connected wallet.
 */
export function TempoFaucetButton({ className = "" }: { className?: string }) {
  const { address } = useAccount();
  const { network } = useNetwork();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");

  const rpc = network.chain.rpcUrls.default.http[0];

  async function claim() {
    if (!address || status === "pending") return;
    setStatus("pending");
    try {
      await fundTempoAddress(rpc, address);
      setStatus("done");
      // Give the node a beat to settle, then refresh every balance read.
      window.setTimeout(() => void qc.invalidateQueries(), 1600);
      window.setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 4000);
    }
  }

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
      disabled={!address || status === "pending"}
      className={className}
      title={
        address
          ? "Fund your wallet with test stablecoins"
          : "Connect a wallet to claim test stablecoins"
      }
    >
      {label}
    </button>
  );
}
