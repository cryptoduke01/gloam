/**
 * Dedicated Robinhood testnet public client.
 * Does NOT depend on wallet connection or wagmi chain selection, browser
 * can always read the vault even when MetaMask is on another network.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { robinhoodTestnet } from "./chain";

let cached: PublicClient | null = null;

export function getRhPublicClient(): PublicClient {
  if (cached) return cached;
  cached = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0], {
      timeout: 25_000,
      retryCount: 2,
    }),
  });
  return cached;
}
