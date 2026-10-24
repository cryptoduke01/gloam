"use client";

import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhood, robinhoodTestnet } from "./chain";
import { NETWORK_KEYS, baseMainnet, baseTestnet, tempoMainnet, tempoTestnet } from "./networks";
import { ORIGIN_CHAINS } from "./originChains";
import { turnkeyConnector } from "./turnkeyConnector";
import { tempoFeeAware } from "./feeSponsor";
import { tempoWalletConnector } from "./tempoWallet";
import { lazyWalletConnect } from "./walletConnect";

const walletConnectFn = lazyWalletConnect();

/**
 * Both older testnets Gloam targets are registered so the app can switch
 * between them at runtime. A mainnet is registered only once its pool is
 * filled in (MAINNET_POOLS in lib/mainnet.ts), and Base Sepolia once
 * BASE_SEPOLIA_POOL is, after the first two testnets so the first chain a
 * connector starts on stays Robinhood Chain testnet.
 *
 * Connectors:
 * - injected: browser wallets on every network. On Tempo (testnet and mainnet)
 *   it sets a fee token first when the account has none and no pathUSD
 *   (lib/feeSponsor.ts).
 * - Turnkey passkey: Robinhood Chain testnet only, behind NEXT_PUBLIC_TURNKEY_ENABLED.
 * - Tempo Wallet: passkey sign-in on Tempo testnet, fees sponsored (lib/tempoWallet.ts).
 * - WalletConnect: a wallet app on a phone (or scanned from desktop) when the
 *   browser has no wallet, behind NEXT_PUBLIC_WC_PROJECT_ID (lib/walletConnect.ts).
 */
const mainnetChains = [
  ...(NETWORK_KEYS.includes("robinhood-mainnet") ? [robinhood] : []),
  ...(NETWORK_KEYS.includes("tempo-mainnet") ? [tempoMainnet] : []),
  ...(NETWORK_KEYS.includes("base-mainnet") ? [baseMainnet] : []),
];
const baseTestnetChains = NETWORK_KEYS.includes("base") ? [baseTestnet] : [];

// The chains a wallet can pay a private bridge order from (lib/originChains),
// only alongside a mainnet: the wallet switches to one to sign there. Base is
// one of them, so once Base mainnet is a Gloam network it is registered once,
// as that network (its RPC answers the vault's log reads).
const originChains = mainnetChains.length
  ? ORIGIN_CHAINS.filter((c) => !mainnetChains.some((m) => m.id === c.id))
  : [];

// wagmi narrows hook `chainId` options to the registered ids. The type names
// all six (GloamChainId); at runtime only the testnets and mainnets with a pool
// are there, plus the bridge's origin chains.
const chains = [
  robinhoodTestnet,
  tempoTestnet,
  ...baseTestnetChains,
  ...mainnetChains,
  ...originChains,
] as unknown as readonly [
  typeof robinhoodTestnet,
  typeof tempoTestnet,
  typeof baseTestnet,
  typeof robinhood,
  typeof tempoMainnet,
  typeof baseMainnet,
];

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    tempoFeeAware(injected({ shimDisconnect: true })),
    turnkeyConnector(),
    tempoWalletConnector(),
    ...(walletConnectFn ? [tempoFeeAware(walletConnectFn)] : []),
  ],
  transports: {
    // Robinhood Chain's public RPC answers JSON-RPC batches: the reads after a wallet
    // connects (balances, allowances, vault state) go out together instead of one by one.
    [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com", { batch: { wait: 16 } }),
    [tempoTestnet.id]: http("https://rpc.moderato.tempo.xyz"),
    [robinhood.id]: http("https://rpc.mainnet.chain.robinhood.com", { batch: { wait: 16 } }),
    [tempoMainnet.id]: http("https://rpc.tempo.xyz"),
    [baseTestnet.id]: http(baseTestnet.rpcUrls.default.http[0], { batch: { wait: 16 } }),
    [baseMainnet.id]: http(baseMainnet.rpcUrls.default.http[0], { batch: { wait: 16 } }),
    ...Object.fromEntries(originChains.map((c) => [c.id, http()])),
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
