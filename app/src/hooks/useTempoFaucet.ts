"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useNetwork } from "@/components/app/NetworkProvider";
import { fundTempoAddress } from "@/lib/tempoFaucet";

export type FaucetStatus = "idle" | "pending" | "done" | "error";

/**
 * Claims Tempo test stablecoins for the connected wallet via tempo_fundAddress,
 * then refetches balances so the new holdings appear. Shared by the portfolio
 * faucet button and the onboarding step, so the funding path is identical
 * wherever it is triggered.
 */
export function useTempoFaucet() {
  const { address } = useAccount();
  const { network } = useNetwork();
  const qc = useQueryClient();
  const [status, setStatus] = useState<FaucetStatus>("idle");

  const rpc = network.chain.rpcUrls.default.http[0];
  const ready = Boolean(address);

  async function claim() {
    if (!address || status === "pending") return;
    setStatus("pending");
    try {
      await fundTempoAddress(rpc, address);
      setStatus("done");
      window.setTimeout(() => void qc.invalidateQueries(), 1600);
      window.setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 4000);
    }
  }

  return { claim, status, ready };
}
