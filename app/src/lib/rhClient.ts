/**
 * Dedicated public client for the active Gloam network's pool reads.
 * Does NOT depend on the wallet connection or wagmi chain selection, so the
 * browser can always read the vault even when the wallet is on another network.
 * Resolves the active network (Robinhood today, Tempo once selectable) and
 * caches one client per chain.
 */

import { createPublicClient, type PublicClient } from "viem";
import { getActiveNetwork, type GloamNetwork } from "./networks";
import { rpcListTransport } from "./rpcList";

const cache = new Map<number, PublicClient>();

/**
 * The read client for one network. Work that spans several reads (a sync, a
 * claim, a payroll run) takes its network once and reads through this, so a
 * network switch halfway through can't send the rest of its reads to another
 * chain: several vaults share one address, and a read there answers for the
 * wrong chain without failing.
 */
export function publicClientFor(net: Pick<GloamNetwork, "chainId" | "chain">): PublicClient {
  const existing = cache.get(net.chainId);
  if (existing) return existing;
  const client = createPublicClient({
    chain: net.chain,
    // the chain's public RPCs in order: one that is down is passed over for a while (lib/rpcList)
    transport: rpcListTransport(net.chain.rpcUrls.default.http, {
      timeout: 25_000,
      retryCount: 2,
    }),
    // reads made together (spent checks, balances) go out as one Multicall3 call
    batch: { multicall: true },
  });
  cache.set(net.chainId, client);
  return client;
}

export function getRhPublicClient(): PublicClient {
  return publicClientFor(getActiveNetwork());
}
