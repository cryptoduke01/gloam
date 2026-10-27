"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getNetwork } from "@/lib/networks";
import { publicClientFor } from "@/lib/rhClient";
import { resolveEnsName } from "@/lib/payRecipient";

export type EnsLookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; name: string; address: Address }
  | { status: "none"; name: string };

/** How long the text must sit still before a name is looked up, ms. */
export const ENS_DEBOUNCE_MS = 400;

/**
 * Resolve an ENS name to its address on Ethereum mainnet, for the Pay box.
 * Reads through the mainnet network's own RPC list (lib/networks, lib/rpcList)
 * with the same read client the vault uses there; ENS lives on mainnet whichever
 * network the app is on. Waits for the text to settle, drops an answer for a
 * name that has since changed, and treats any failure as "no address".
 * Pass null when the text is not a name.
 */
export function useEnsAddress(name: string | null): EnsLookup {
  const [state, setState] = useState<{ name: string; result: Address | null } | null>(null);

  useEffect(() => {
    if (!name) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      const client = publicClientFor(getNetwork("ethereum-mainnet"));
      void resolveEnsName(
        name,
        (n) => client.getEnsAddress({ name: n }),
        () => stale
      ).then((result) => {
        if (!stale) setState({ name, result });
      });
    }, ENS_DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [name]);

  if (!name) return { status: "idle" };
  if (!state || state.name !== name) return { status: "loading" };
  return state.result
    ? { status: "found", name, address: state.result }
    : { status: "none", name };
}
