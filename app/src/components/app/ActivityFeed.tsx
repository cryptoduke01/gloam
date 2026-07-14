"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { EXPLORER_TX, formatEth, shortAddress } from "@/lib/chain";
import { useActivity } from "@/hooks/useActivity";
import { StatusPill } from "./StatusPill";

const PAGE_SIZE = 5;

export function ActivityFeed() {
  const { address, isConnected } = useAccount();
  const { data, isLoading, isError } = useActivity(address);
  const [page, setPage] = useState(0);

  const txs = data?.txs ?? [];
  const pageCount = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));

  // Reset page when address or list shrinks
  useEffect(() => {
    setPage(0);
  }, [address]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const pageTxs = useMemo(() => {
    const start = page * PAGE_SIZE;
    return txs.slice(start, start + PAGE_SIZE);
  }, [txs, page]);

  if (!isConnected || !address) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
        Connect to see recent activity.
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(28rem,70vh)] flex-col overflow-hidden rounded-xl border border-line bg-panel lg:sticky lg:top-20">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Public activity
        </p>
        <StatusPill>Onchain</StatusPill>
      </div>

      {isLoading && (
        <p className="px-4 py-6 text-sm text-mute">Loading explorer…</p>
      )}
      {isError && (
        <p className="px-4 py-6 text-sm text-mute">
          Could not load history. Try again.
        </p>
      )}
      {!isLoading && !isError && txs.length === 0 && (
        <p className="px-4 py-6 text-sm text-mute">
          No activity yet. Send ETH to see it here.
        </p>
      )}

      {!isLoading && !isError && txs.length > 0 && (
        <>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {pageTxs.map((tx) => {
              const out = tx.from.toLowerCase() === address.toLowerCase();
              let eth = "0";
              try {
                eth = formatEth(BigInt(tx.valueWei), 5);
              } catch {
                eth = formatEther(BigInt(0));
              }
              const zero =
                tx.valueWei === "0" || tx.valueWei === "0x0" || eth === "0";
              return (
                <li
                  key={tx.hash}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {zero
                        ? out
                          ? "Contract call"
                          : "Incoming call"
                        : out
                          ? "Sent"
                          : "Received"}{" "}
                      {!zero && (
                        <span className="font-mono">{eth} ETH</span>
                      )}
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line px-2 text-sm text-foreground hover:border-mute disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              ←
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
              {page + 1} / {pageCount}
              <span className="ml-2 normal-case tracking-normal text-mute/80">
                ({txs.length} tx)
              </span>
            </p>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line px-2 text-sm text-foreground hover:border-mute disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
