/**
 * Vault status per network for GET /api/v1/vaults. Public data only: the
 * network registry, the relay's readiness, and a few cheap reads of the pool.
 */
import { parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { getNetwork, NETWORK_KEYS, isNetworkWritable, type GloamNetwork, type NetworkKey } from "@/lib/networks";
import { relayPublicClient, relayStatus, type RelayNetworkStatus } from "@/lib/relay/server";
import { shieldTokensFor, supportsNativeShield } from "@/lib/tokens";

const POOL_VIEW_ABI = parseAbi([
  "function nextIndex() view returns (uint256)",
  "function currentRoot() view returns (bytes32)",
]);

const READ_TIMEOUT_MS = 8_000;

/**
 * Leaves the pool's tree can ever hold: 2^20 = 1,048,576 at depth 20
 * (IncrementalMerkleTreePoseidon.DEPTH, MERKLE_DEPTH in the SDK). When it is
 * full, deposits and private sends stop; cash outs still work.
 */
const TREE_CAPACITY = 2 ** 20;

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

export type VaultAsset = { symbol: string; address: Address; decimals: number; stable: boolean; native: boolean };

export type VaultStatus = {
  network: NetworkKey;
  label: string;
  chainId: number;
  testnet: boolean;
  status: "live" | "planned";
  pool: Address | null;
  deployBlock: string | null;
  payMemo: Address | null;
  explorer: string | null;
  assets: VaultAsset[];
  relay: { enabled: boolean; memo: boolean; lowBalance: boolean };
  /**
   * Read from the chain just now; null when the read failed or timed out.
   * `leafCapacity` and `leavesLeft` are there to watch the tree fill up.
   */
  chain: { block: string; leafCount: number; leafCapacity: number; leavesLeft: number; root: Hex } | null;
};

export function vaultAssets(net: GloamNetwork): VaultAsset[] {
  const tokens = shieldTokensFor(net.chainId).map((t) => ({
    symbol: t.symbol,
    address: t.address,
    decimals: t.decimals,
    stable: t.kind === "stablecoin",
    native: false,
  }));
  const native: VaultAsset[] = supportsNativeShield(net.chainId)
    ? [{ symbol: net.primaryAsset.symbol, address: zeroAddress, decimals: net.primaryAsset.decimals, stable: false, native: true }]
    : [];
  return [...tokens.filter((t) => t.stable), ...native, ...tokens.filter((t) => !t.stable)];
}

async function chainRead(net: GloamNetwork): Promise<VaultStatus["chain"]> {
  if (!isNetworkWritable(net) || !net.pool) return null;
  try {
    const client = relayPublicClient(net);
    const [block, leafCount, root] = await timeout(
      Promise.all([
        client.getBlockNumber(),
        client.readContract({ address: net.pool, abi: POOL_VIEW_ABI, functionName: "nextIndex" }),
        client.readContract({ address: net.pool, abi: POOL_VIEW_ABI, functionName: "currentRoot" }),
      ]),
      READ_TIMEOUT_MS
    );
    const leaves = Number(leafCount);
    return { block: block.toString(), leafCount: leaves, leafCapacity: TREE_CAPACITY, leavesLeft: Math.max(0, TREE_CAPACITY - leaves), root };
  } catch {
    return null;
  }
}

export async function vaultStatuses(only?: NetworkKey): Promise<VaultStatus[]> {
  const keys = only ? [only] : NETWORK_KEYS;
  const relays: RelayNetworkStatus[] = await relayStatus().catch(() => []);
  return Promise.all(
    keys.map(async (key) => {
      const net = getNetwork(key);
      const relay = relays.find((r) => r.chainId === net.chainId);
      return {
        network: net.key,
        label: net.label,
        chainId: net.chainId,
        testnet: net.chain.testnet === true,
        status: net.status,
        pool: net.pool,
        deployBlock: net.deployBlock?.toString() ?? null,
        payMemo: net.payMemo?.address ?? null,
        explorer: net.pool ? net.explorerAddress(net.pool) : null,
        assets: vaultAssets(net),
        relay: { enabled: relay?.enabled ?? false, memo: relay?.memo ?? false, lowBalance: relay?.lowBalance ?? false },
        chain: await chainRead(net),
      } satisfies VaultStatus;
    })
  );
}
