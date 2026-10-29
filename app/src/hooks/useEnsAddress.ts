"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getNetwork } from "@/lib/networks";
import { publicClientFor } from "@/lib/rhClient";
import { isContractCode, resolveEnsForChain } from "@/lib/payRecipient";

export type EnsLookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; name: string; address: Address; source: "chain" | "evm" | "mainnet" }
  | { status: "unsafe"; name: string; address: Address }
  | { status: "none"; name: string };

/** How long the text must sit still before a name is looked up, ms. */
export const ENS_DEBOUNCE_MS = 400;

type Result = Exclude<EnsLookup, { status: "idle" } | { status: "loading" }>;

/**
 * Resolve an ENS name for the Pay box, to the address it should be paid at on
 * the network with `chainId` (lib/payRecipient resolveEnsForChain): the name's
 * record for that network first, then its default EVM record, and its Ethereum
 * record only when that is a plain wallet. ENS lives on Ethereum mainnet
 * whichever network the app is on, so every read goes through the mainnet
 * network's own RPC list (lib/networks, lib/rpcList). Waits for the text to
 * settle, drops an answer for a name or network that has since changed, and
 * treats any failure as "no address". Pass null when the text is not a name.
 */
export function useEnsAddress(name: string | null, chainId: number): EnsLookup {
  const [state, setState] = useState<{ key: string; result: Result } | null>(null);
  const key = name ? `${chainId}:${name}` : "";

  useEffect(() => {
    if (!name) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      const client = publicClientFor(getNetwork("ethereum-mainnet"));
      void resolveEnsForChain(
        name,
        chainId,
        {
          read: (n, coinType) => client.getEnsAddress({ name: n, coinType }),
          isContract: async (address) => isContractCode(await client.getCode({ address })),
        },
        () => stale
      ).then((r) => {
        if (stale) return;
        const result: Result =
          r.status === "found"
            ? { status: "found", name, address: r.address, source: r.source }
            : r.status === "unsafe"
              ? { status: "unsafe", name, address: r.address }
              : { status: "none", name };
        setState({ key: `${chainId}:${name}`, result });
      });
    }, ENS_DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [name, chainId]);

  if (!name) return { status: "idle" };
  if (!state || state.key !== key) return { status: "loading" };
  return state.result;
}
