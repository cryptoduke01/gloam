"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNetwork } from "@/components/app/NetworkProvider";
import { useAppAccount } from "@/lib/demo";
import { erc20Abi } from "@/lib/dex";
import { readDemo } from "@/lib/demoFlag";
import { getRhPublicClient } from "@/lib/rhClient";
import { fundTempoAddress } from "@/lib/tempoFaucet";
import { TEMPO_STABLE_TOKENS } from "@/lib/tokens";

export type FaucetStatus = "idle" | "pending" | "done" | "error" | "enough";

/**
 * Tempo's faucet hands out a fixed 1,000,000 of each test stablecoin per claim,
 * which Gloam cannot change. So a wallet that already holds this much in test
 * stablecoins is not funded again, and balances stay closer to real life.
 */
const ENOUGH_USD = 50_000;

async function testStablesUsd(address: `0x${string}`): Promise<number> {
  const client = getRhPublicClient();
  const bals = await Promise.all(
    TEMPO_STABLE_TOKENS.map((t) =>
      client
        .readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })
        .then((v) => Number(v as bigint) / 10 ** t.decimals)
        .catch(() => 0)
    )
  );
  return bals.reduce((s, b) => s + b, 0);
}

/**
 * Claims Tempo test stablecoins for the connected wallet via tempo_fundAddress,
 * then refetches balances so the new holdings appear. Shared by the portfolio
 * faucet button and the onboarding step, so the funding path is identical
 * wherever it is triggered.
 */
export function useTempoFaucet() {
  const { address } = useAppAccount();
  const { network } = useNetwork();
  const qc = useQueryClient();
  const [status, setStatus] = useState<FaucetStatus>("idle");

  const rpc = network.chain.rpcUrls.default.http[0];
  const ready = Boolean(address);

  async function claim() {
    if (!address || status === "pending") return;
    setStatus("pending");
    try {
      if (!readDemo() && (await testStablesUsd(address)) >= ENOUGH_USD) {
        setStatus("enough");
        window.setTimeout(() => setStatus("idle"), 4000);
        return;
      }
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
