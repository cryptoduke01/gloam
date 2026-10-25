"use client";

/**
 * Once a mainnet sits next to the testnets, a testnet page says so at the top:
 * this is a testnet, and its own chain's mainnet is one tap away. Nothing shows
 * before a mainnet pool is filled in, or on a mainnet.
 */
import { MAINNET_ENABLED, mainnetOf } from "@/lib/networks";
import { useNetwork } from "./NetworkProvider";

export function TestFundsNotice() {
  const { network, setNetworkKey, settled } = useNetwork();
  // Not before this browser's network is known: a mainnet visitor never sees it flash.
  if (!settled || !MAINNET_ENABLED || !network.testnet) return null;
  // its own chain's mainnet, never another chain's (Base Sepolia offered Robinhood Chain mainnet)
  const target = mainnetOf(network);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[14px] bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-soft">
      <p className="min-w-0">
        <span className="font-medium text-foreground">Testnet.</span> Balances here stay on this
        testnet.
      </p>
      {target && (
        <button
          type="button"
          onClick={() => setNetworkKey(target.key)}
          className="btn btn-ghost btn-sm h-9 shrink-0"
        >
          Switch to {target.label} mainnet
        </button>
      )}
    </div>
  );
}
