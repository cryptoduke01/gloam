/**
 * Per-network runtime config for the MCP's execution rail. Pool + chainId +
 * nativeShield come from the SDK's GLOAM_NETWORKS (single source of truth); rpc,
 * explorer, tree-scan deploy block, native currency, and the default shieldable
 * asset are added here because the SDK stays transport-agnostic.
 *
 * Robinhood and Tempo are separate deployments of the same pool design, so the
 * same execution code serves either — pick the network and go.
 */
import type { Address } from "viem";
import { GLOAM_NETWORKS, TEMPO_PATHUSD, NATIVE_ASSET } from "@gloamtrade/sdk";

export type NetworkKey = "robinhood" | "tempo";

export interface McpNetwork {
  key: NetworkKey;
  name: string;
  chainId: number;
  pool: Address;
  rpc: string;
  explorer: string;
  /** Block the pool was deployed at, for tree scans. */
  deployBlock: bigint;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Whether native-value shields are allowed (Tempo blocks native msg.value). */
  nativeShield: boolean;
  /** Default asset to shield: native on Robinhood, PathUSD on Tempo. */
  defaultAsset: Address;
  defaultAssetSymbol: string;
  defaultAssetDecimals: number;
}

export const MCP_NETWORKS: Record<NetworkKey, McpNetwork> = {
  robinhood: {
    key: "robinhood",
    name: "Robinhood Chain Testnet",
    chainId: GLOAM_NETWORKS.robinhood.chainId,
    pool: GLOAM_NETWORKS.robinhood.pool,
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    deployBlock: 110_840_714n,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    nativeShield: true,
    defaultAsset: NATIVE_ASSET,
    defaultAssetSymbol: "ETH",
    defaultAssetDecimals: 18,
  },
  tempo: {
    key: "tempo",
    name: "Tempo Moderato Testnet",
    chainId: GLOAM_NETWORKS.tempo.chainId,
    pool: GLOAM_NETWORKS.tempo.pool,
    rpc: "https://rpc.moderato.tempo.xyz",
    explorer: "https://explore.testnet.tempo.xyz",
    deployBlock: 35_578_268n,
    nativeCurrency: { name: "US Dollar", symbol: "USD", decimals: 18 },
    nativeShield: false,
    defaultAsset: TEMPO_PATHUSD,
    defaultAssetSymbol: "PathUSD",
    defaultAssetDecimals: 6,
  },
};

export function networkByKey(key: NetworkKey): McpNetwork {
  return MCP_NETWORKS[key];
}

export function networkByChainId(chainId: number): McpNetwork | undefined {
  return Object.values(MCP_NETWORKS).find((n) => n.chainId === chainId);
}
