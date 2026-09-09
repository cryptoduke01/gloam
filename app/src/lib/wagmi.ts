"use client";

import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodTestnet } from "./chain";
import { tempoTestnet } from "./networks";
import { turnkeyConnector } from "./turnkeyConnector";

/**
 * Product is **testnet-only** until stocks/swaps/privacy work end-to-end.
 * Mainnet chains are intentionally not registered here. Both testnets Gloam
 * targets are registered so the app can switch between them at runtime.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, tempoTestnet],
  connectors: [injected({ shimDisconnect: true }), turnkeyConnector()],
  transports: {
    [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com"),
    [tempoTestnet.id]: http("https://rpc.moderato.tempo.xyz"),
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
