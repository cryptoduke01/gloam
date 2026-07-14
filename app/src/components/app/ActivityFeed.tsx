"use client";

import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { EXPLORER_TX, formatEth, shortAddress } from "@/lib/chain";
import { useActivity } from "@/hooks/useActivity";
import { StatusPill } from "./StatusPill";

export function ActivityFeed() {
  const { address, isConnected } = useAccount();
  const { data, isLoading, isError } = useActivity(address);

  if (!isConnected || !address) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Connect to load public activity from Robinhood Chain testnet.
      </div>
    );
  }

  const txs = data?.txs ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Public activity
        </p>
        <StatusPill>Blockscout</StatusPill>
      </div>
      {isLoading && (
        <p className="px-4 py-6 text-sm text-mute">Loading explorer…</p>
      )}
      {isError && (
        <p className="px-4 py-6 text-sm text-mute">
          Explorer API unavailable. Try again shortly.
        </p>
      )}
      {!isLoading && !isError && txs.length === 0 && (
        <p className="px-4 py-6 text-sm text-mute">
          No public txs yet. Send on testnet to see history.
        </p>
      )}
      <ul>
        {txs.map((tx) => {
          const out =
            tx.from.toLowerCase() === address.toLowerCase();
          let eth = "0";
          try {
            eth = formatEth(BigInt(tx.valueWei), 5);
          } catch {
            eth = formatEther(BigInt(0));
          }
          return (
            <li
              key={tx.hash}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-0"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {out ? "Sent" : "Received"}{" "}
                  <span className="font-mono">{eth} ETH</span>
                </p>
                <p className="truncate font-mono text-[11px] text-mute">
                  {out ? "to" : "from"}{" "}
                  {shortAddress(out ? tx.to : tx.from, 4)}
                </p>
              </div>
              <a
                href={EXPLORER_TX(tx.hash)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-lime hover:underline"
              >
                Tx →
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
