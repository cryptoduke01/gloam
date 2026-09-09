/**
 * Gloam network registry: the runtime source of truth for every chain the
 * product can point at. Today Robinhood Chain testnet is the live flagship;
 * Tempo testnet (Moderato) is scaffolded for the World's Fair expansion and is
 * marked `planned` until its shielded pool + verifiers are deployed (Phase 1).
 *
 * Everything chain-specific (chain object, shielded pool, deploy block, hash
 * scheme, native + stable assets, explorer links) hangs off one `GloamNetwork`
 * record so the app can switch networks at runtime instead of at build time.
 * Robinhood values are re-exported from the existing single sources
 * (chain.ts / config.ts) so there is no second copy to drift.
 */
import { defineChain, type Address, type Chain } from "viem";
import { robinhoodTestnet } from "./chain";
import {
  TESTNET_POSEIDON_POOL,
  TESTNET_POSEIDON_DEPLOY_BLOCK,
  type HashScheme,
} from "./config";

export type NetworkKey = "robinhood" | "tempo";

/**
 * Chain ids of the networks registered in the wagmi config. Typed as the literal
 * union so `network.chainId` is accepted directly by wagmi hook options
 * (`useBalance`, `useSendTransaction`, `useWaitForTransactionReceipt`,
 * `switchChain`), which narrow `chainId` to the configured ids.
 */
export type GloamChainId = 46630 | 42431;

/** Whether a network is deployed and safe for real shield/spend writes. */
export type NetworkStatus = "live" | "planned";

export interface NetworkAsset {
  symbol: string;
  /** ERC-20 address, or null for the chain's native gas asset. */
  address: Address | null;
  decimals: number;
}

export interface GloamNetwork {
  key: NetworkKey;
  label: string;
  /** viem chain used for clients, wallet_addEthereumChain, etc. */
  chain: Chain;
  chainId: GloamChainId;
  /** Shielded pool address; null while a network is still `planned`. */
  pool: Address | null;
  /** Block the pool was deployed at, for getLogs / tree rebuild. */
  deployBlock: bigint | null;
  hashScheme: HashScheme;
  /** The asset the chain leads with in the product narrative. */
  primaryAsset: NetworkAsset;
  /** Stable assets shieldable on this network (empty until registered). */
  stableAssets: NetworkAsset[];
  status: NetworkStatus;
  /** One-line, honest description of where the network stands. */
  note: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (addr: string) => string;
}

/**
 * Tempo testnet (Moderato). Payments-first EVM L1 (Reth) incubated by Stripe +
 * Paradigm; native currency is USD and gas is paid in stablecoins. Params from
 * the official connection docs (docs.tempo.xyz). USD decimals are unspecified
 * upstream; 18 is the EVM/Reth default and must be confirmed before writes.
 */
export const tempoTestnet = defineChain({
  id: 42431,
  name: "Tempo Testnet (Moderato)",
  nativeCurrency: { name: "US Dollar", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Tempo Testnet Explorer",
      url: "https://explore.testnet.tempo.xyz",
    },
  },
  testnet: true,
});

const NETWORKS: Record<NetworkKey, GloamNetwork> = {
  robinhood: {
    key: "robinhood",
    label: "Robinhood Chain",
    chain: robinhoodTestnet,
    chainId: robinhoodTestnet.id,
    pool: TESTNET_POSEIDON_POOL,
    deployBlock: TESTNET_POSEIDON_DEPLOY_BLOCK,
    hashScheme: "poseidon",
    primaryAsset: { symbol: "ETH", address: null, decimals: 18 },
    stableAssets: [],
    status: "live",
    note: "Live on testnet: shield, private send, cash out, selective disclosure.",
    explorerTx: (hash) =>
      `${robinhoodTestnet.blockExplorers.default.url}/tx/${hash}`,
    explorerAddress: (addr) =>
      `${robinhoodTestnet.blockExplorers.default.url}/address/${addr}`,
  },
  tempo: {
    key: "tempo",
    label: "Tempo",
    chain: tempoTestnet,
    chainId: tempoTestnet.id,
    // Deployed on Tempo Moderato 2026-09-09 (DeployTempo + DeployTempoPool).
    pool: "0x3eeE869aFF476D90aF6CF0bC8F0b450C98A8D30b",
    deployBlock: 34_556_677n,
    hashScheme: "poseidon",
    primaryAsset: { symbol: "USD", address: null, decimals: 18 },
    stableAssets: [],
    // Pool is live on-chain; the app write-path cutover to useNetwork() is the
    // last step before flipping this to "live" so the selector is honest.
    status: "planned",
    note: "Deployed on Tempo Moderato. Private stablecoin payments; app toggle integration in progress.",
    explorerTx: (hash) =>
      `${tempoTestnet.blockExplorers.default.url}/tx/${hash}`,
    explorerAddress: (addr) =>
      `${tempoTestnet.blockExplorers.default.url}/address/${addr}`,
  },
};

export const DEFAULT_NETWORK_KEY: NetworkKey = "robinhood";

/** localStorage key the network selector persists to (mirror of NetworkProvider). */
const ACTIVE_NETWORK_STORAGE_KEY = "gloam.network";

/**
 * The active network for non-React code (lib functions that cannot use the
 * useNetwork hook). Reads the same localStorage key the selector writes, and
 * defaults to Robinhood. SSR and blocked-storage safe. React components should
 * prefer useNetwork().
 *
 * Only `live` networks are selectable in the UI, so today this always resolves
 * to Robinhood; it becomes meaningful the moment Tempo is marked live.
 */
export function getActiveNetwork(): GloamNetwork {
  if (typeof window === "undefined") return NETWORKS[DEFAULT_NETWORK_KEY];
  try {
    const v = window.localStorage.getItem(ACTIVE_NETWORK_STORAGE_KEY);
    if (isNetworkKey(v)) {
      const n = NETWORKS[v];
      // Never resolve to a non-writable network for lib/write code.
      if (isNetworkWritable(n)) return n;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return NETWORKS[DEFAULT_NETWORK_KEY];
}

export const NETWORK_KEYS = Object.keys(NETWORKS) as NetworkKey[];

export function getNetwork(key: NetworkKey): GloamNetwork {
  return NETWORKS[key];
}

/** All networks, live first, for rendering a selector. */
export function allNetworks(): GloamNetwork[] {
  return NETWORK_KEYS.map(getNetwork).sort((a, b) =>
    a.status === b.status ? 0 : a.status === "live" ? -1 : 1
  );
}

export function isNetworkKey(v: string | null | undefined): v is NetworkKey {
  return v === "robinhood" || v === "tempo";
}

/** A network can take real shield/spend writes only when live with a pool. */
export function isNetworkWritable(n: GloamNetwork): boolean {
  return n.status === "live" && n.pool !== null;
}
