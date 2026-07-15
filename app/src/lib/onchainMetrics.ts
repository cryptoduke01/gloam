/**
 * On-chain traction from ShieldPool logs — source of truth for volume & users.
 */

import {
  createPublicClient,
  formatEther,
  http,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { robinhoodTestnet } from "./chain";
import {
  SHIELD_DEPLOY_BLOCK,
  SHIELD_POOL_ADDRESS,
  NATIVE_ASSET,
  shieldPoolAbi,
} from "./shield";
import { TESTNET_STOCK_TOKENS } from "./tokens";

const LOG_CHUNK = 40_000n;

type DecodedLog = Log & { args?: Record<string, unknown> };

async function getLogsChunked(
  client: PublicClient,
  params: {
    address: Address;
    event: {
      type: "event";
      name: string;
      inputs: readonly {
        name: string;
        type: string;
        indexed: boolean;
      }[];
    };
    fromBlock: bigint;
  },
): Promise<DecodedLog[]> {
  const latest = await client.getBlockNumber();
  if (latest < params.fromBlock) return [];
  const out: DecodedLog[] = [];
  for (let start = params.fromBlock; start <= latest; start += LOG_CHUNK) {
    let end = start + LOG_CHUNK - 1n;
    if (end > latest) end = latest;
    try {
      const chunk = (await client.getLogs({
        address: params.address,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: params.event as any,
        fromBlock: start,
        toBlock: end,
      })) as DecodedLog[];
      out.push(...chunk);
    } catch {
      /* chunk failed — continue */
    }
  }
  return out;
}

function client(): PublicClient {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0], {
      timeout: 30_000,
    }),
  });
}

export type OnchainMetrics = {
  pool: Address | null;
  chainId: number;
  asOf: string;
  latestBlock: string;
  notes: string;
  shields: number;
  transfers: number;
  unshields: number;
  sealedSwaps: number;
  uniqueShielders: number;
  uniqueUnshieldTos: number;
  shieldVolumeEth: string;
  unshieldVolumeEth: string;
  shieldVolumeByAsset: { asset: string; symbol: string; amount: string; count: number }[];
  unshieldVolumeByAsset: { asset: string; symbol: string; amount: string; count: number }[];
  poolBalances: { asset: string; symbol: string; deposited: string }[];
  topShielders: {
    address: string;
    shields: number;
    volumeEth: string;
  }[];
  recentTxs: {
    kind: string;
    txHash: string;
    blockNumber: string;
    detail: string;
    from?: string;
  }[];
};

function symbolFor(asset: Address): string {
  if (asset.toLowerCase() === NATIVE_ASSET.toLowerCase()) return "ETH";
  const t = TESTNET_STOCK_TOKENS.find(
    (x) => x.address.toLowerCase() === asset.toLowerCase(),
  );
  return t?.symbol ?? `${asset.slice(0, 6)}…`;
}

function fmtAmount(asset: Address, amount: bigint): string {
  if (asset.toLowerCase() === NATIVE_ASSET.toLowerCase()) {
    return `${formatEther(amount)} ETH`;
  }
  // 18 dec faucet stocks
  return `${formatEther(amount)} ${symbolFor(asset)}`;
}

export async function fetchOnchainMetrics(): Promise<OnchainMetrics> {
  const pool = SHIELD_POOL_ADDRESS;
  const empty: OnchainMetrics = {
    pool,
    chainId: robinhoodTestnet.id,
    asOf: new Date().toISOString(),
    latestBlock: "0",
    notes: "0",
    shields: 0,
    transfers: 0,
    unshields: 0,
    sealedSwaps: 0,
    uniqueShielders: 0,
    uniqueUnshieldTos: 0,
    shieldVolumeEth: "0",
    unshieldVolumeEth: "0",
    shieldVolumeByAsset: [],
    unshieldVolumeByAsset: [],
    poolBalances: [],
    topShielders: [],
    recentTxs: [],
  };
  if (!pool) return empty;

  const c = client();
  const latest = await c.getBlockNumber();

  const [shieldLogs, transferLogs, unshieldLogs, sealedLogs, nextIndex] =
    await Promise.all([
      getLogsChunked(c, {
        address: pool,
        event: {
          type: "event",
          name: "Shielded",
          inputs: [
            { name: "commitment", type: "bytes32", indexed: true },
            { name: "asset", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "leafIndex", type: "uint256", indexed: false },
            { name: "from", type: "address", indexed: true },
          ],
        },
        fromBlock: SHIELD_DEPLOY_BLOCK,
      }),
      getLogsChunked(c, {
        address: pool,
        event: {
          type: "event",
          name: "Transferred",
          inputs: [
            { name: "nullifier", type: "bytes32", indexed: true },
            { name: "newCommitments", type: "bytes32[2]", indexed: false },
          ],
        },
        fromBlock: SHIELD_DEPLOY_BLOCK,
      }),
      getLogsChunked(c, {
        address: pool,
        event: {
          type: "event",
          name: "Unshielded",
          inputs: [
            { name: "nullifier", type: "bytes32", indexed: true },
            { name: "asset", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ],
        },
        fromBlock: SHIELD_DEPLOY_BLOCK,
      }),
      getLogsChunked(c, {
        address: pool,
        event: {
          type: "event",
          name: "SealedSwapped",
          inputs: [
            { name: "nullifier", type: "bytes32", indexed: true },
            { name: "assetIn", type: "address", indexed: true },
            { name: "assetOut", type: "address", indexed: true },
            { name: "newCommitmentOut", type: "bytes32", indexed: false },
            { name: "newCommitmentChange", type: "bytes32", indexed: false },
          ],
        },
        fromBlock: SHIELD_DEPLOY_BLOCK,
      }).catch(() => [] as DecodedLog[]),
      c.readContract({
        address: pool,
        abi: shieldPoolAbi,
        functionName: "nextIndex",
      }).catch(() => 0n),
    ]);

  const shielders = new Set<string>();
  const shielderStats = new Map<
    string,
    { shields: number; volumeEth: bigint }
  >();
  const shieldByAsset = new Map<string, { amount: bigint; count: number }>();
  let shieldEth = 0n;
  const recentTxs: OnchainMetrics["recentTxs"] = [];

  for (const log of shieldLogs) {
    const args = log.args as {
      from?: Address;
      asset?: Address;
      amount?: bigint;
    };
    const from = args.from?.toLowerCase();
    if (from) {
      shielders.add(from);
      const st = shielderStats.get(from) ?? { shields: 0, volumeEth: 0n };
      st.shields += 1;
      const asset = (args.asset ?? NATIVE_ASSET) as Address;
      const amount = args.amount ?? 0n;
      if (asset.toLowerCase() === NATIVE_ASSET.toLowerCase()) {
        st.volumeEth += amount;
      }
      shielderStats.set(from, st);
    }
    const asset = (args.asset ?? NATIVE_ASSET) as Address;
    const amount = args.amount ?? 0n;
    const key = asset.toLowerCase();
    const cur = shieldByAsset.get(key) ?? { amount: 0n, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    shieldByAsset.set(key, cur);
    if (key === NATIVE_ASSET.toLowerCase()) shieldEth += amount;
    if (log.transactionHash) {
      recentTxs.push({
        kind: "shield",
        txHash: log.transactionHash as Hex,
        blockNumber: String(log.blockNumber ?? 0n),
        detail: fmtAmount(asset, amount),
        from: args.from,
      });
    }
  }

  const unshieldTos = new Set<string>();
  const unshieldByAsset = new Map<string, { amount: bigint; count: number }>();
  let unshieldEth = 0n;

  for (const log of unshieldLogs) {
    const args = log.args as {
      to?: Address;
      asset?: Address;
      amount?: bigint;
    };
    if (args.to) unshieldTos.add(args.to.toLowerCase());
    const asset = (args.asset ?? NATIVE_ASSET) as Address;
    const amount = args.amount ?? 0n;
    const key = asset.toLowerCase();
    const cur = unshieldByAsset.get(key) ?? { amount: 0n, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    unshieldByAsset.set(key, cur);
    if (key === NATIVE_ASSET.toLowerCase()) unshieldEth += amount;
    if (log.transactionHash) {
      recentTxs.push({
        kind: "unshield",
        txHash: log.transactionHash as Hex,
        blockNumber: String(log.blockNumber ?? 0n),
        detail: fmtAmount(asset, amount),
        from: args.to,
      });
    }
  }

  for (const log of transferLogs) {
    if (log.transactionHash) {
      recentTxs.push({
        kind: "transfer",
        txHash: log.transactionHash as Hex,
        blockNumber: String(log.blockNumber ?? 0n),
        detail: "private send",
      });
    }
  }
  for (const log of sealedLogs) {
    if (log.transactionHash) {
      recentTxs.push({
        kind: "sealed_swap",
        txHash: log.transactionHash as Hex,
        blockNumber: String(log.blockNumber ?? 0n),
        detail: "sealed trade",
      });
    }
  }

  recentTxs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

  const assetsToRead: Address[] = [
    NATIVE_ASSET,
    ...TESTNET_STOCK_TOKENS.map((t) => t.address as Address),
  ];
  const poolBalances: OnchainMetrics["poolBalances"] = [];
  for (const asset of assetsToRead) {
    try {
      const d = (await c.readContract({
        address: pool,
        abi: shieldPoolAbi,
        functionName: "deposited",
        args: [asset],
      })) as bigint;
      if (d > 0n) {
        poolBalances.push({
          asset,
          symbol: symbolFor(asset),
          deposited: formatEther(d),
        });
      }
    } catch {
      /* skip */
    }
  }

  const mapVol = (m: Map<string, { amount: bigint; count: number }>) =>
    [...m.entries()].map(([asset, v]) => ({
      asset,
      symbol: symbolFor(asset as Address),
      amount: formatEther(v.amount),
      count: v.count,
    }));

  const topShielders = [...shielderStats.entries()]
    .map(([address, st]) => ({
      address,
      shields: st.shields,
      volumeEth: formatEther(st.volumeEth),
    }))
    .sort((a, b) => b.shields - a.shields)
    .slice(0, 50);

  return {
    pool,
    chainId: robinhoodTestnet.id,
    asOf: new Date().toISOString(),
    latestBlock: String(latest),
    notes: String(nextIndex),
    shields: shieldLogs.length,
    transfers: transferLogs.length,
    unshields: unshieldLogs.length,
    sealedSwaps: sealedLogs.length,
    uniqueShielders: shielders.size,
    uniqueUnshieldTos: unshieldTos.size,
    shieldVolumeEth: formatEther(shieldEth),
    unshieldVolumeEth: formatEther(unshieldEth),
    shieldVolumeByAsset: mapVol(shieldByAsset),
    unshieldVolumeByAsset: mapVol(unshieldByAsset),
    poolBalances,
    topShielders,
    recentTxs: recentTxs.slice(0, 40),
  };
}
