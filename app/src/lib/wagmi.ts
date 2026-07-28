"use client";

import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodTestnet } from "./chain";
import { turnkeyConnector } from "./turnkeyConnector";

/**
 * Product is **testnet-only** until stocks/swaps/privacy work end-to-end.
 * Mainnet chain is intentionally not registered here.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected({ shimDisconnect: true }), turnkeyConnector()],
  transports: {
    [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com"),
  },
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
