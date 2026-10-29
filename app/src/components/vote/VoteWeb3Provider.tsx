"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, createStorage, cookieStorage, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhood } from "@/lib/chain";
import { lazyWalletConnect } from "@/lib/walletConnect";

const walletConnectFn = lazyWalletConnect();

/**
 * A small wallet setup for the vote pages: Robinhood Chain mainnet only, a
 * browser wallet, or a wallet app over WalletConnect when the browser has
 * none. A vote is a signature, so nothing here sends a transaction. Kept
 * apart from the app's (lib/wagmi) so /vote loads none of the vault code,
 * under its own storage key so it never disturbs the app's connection.
 */
const voteWagmiConfig = createConfig({
  chains: [robinhood],
  connectors: [injected({ shimDisconnect: true }), ...(walletConnectFn ? [walletConnectFn] : [])],
  transports: { [robinhood.id]: http() },
  ssr: true,
  storage: createStorage({ storage: cookieStorage, key: "gloam.vote" }),
});

// wagmi's types are registered for the app's config (lib/wagmi), which lists every chain; this one is a subset of it
type RegisteredConfig = Parameters<typeof WagmiProvider>[0]["config"];

export function VoteWeb3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={voteWagmiConfig as unknown as RegisteredConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
