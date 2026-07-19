/**
 * Rebuild ShieldPool Merkle tree from on-chain insertions:
 *   - Shielded → one leaf (commitment)
 *   - Transferred → two leaves (payment, change) in that order
 *   - SealedSwapped → two leaves (out, change) in that order
 *
 * Private send only emits Transferred; private trade only SealedSwapped —
 * ignoring either makes root mismatch after those txs.
 */

import type { Address, Hex, Log, PublicClient } from "viem";
import {
  HASH_SCHEME,
  SHIELD_DEPLOY_BLOCK,
  SHIELD_POOL_ADDRESS,
  shieldPoolAbi,
} from "./shield";
import { IncrementalMerkleTree } from "./merkle";
import { IncrementalMerkleTreePoseidon } from "./merklePoseidon";
import type { MerklePath } from "./merkle";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { fieldToHex, hexToField } from "./poseidon";

export type ChainLeaf = {
  leafIndex: number;
  commitment: Hex;
  /** shield | transfer (pay/change) | sealed swap out/change (also "transfer") */
  kind: "shield" | "transfer";
  asset?: Address;
  amount?: bigint;
  from?: Address;
  txHash?: Hex;
  blockNumber?: bigint;
  logIndex?: number;
};

export type SyncedTree = {
  scheme: "keccak" | "poseidon";
  leaves: ChainLeaf[];
  root: Hex;
  leafCount: number;
  /** Look up leaf index by commitment hex */
  indexByCommitment: Map<string, number>;
  pathForLeaf: (
    leafIndex: number
  ) => Promise<MerklePath | PoseidonMerklePath | null>;
};

type OrderedInsert = {
  commitment: Hex;
  kind: "shield" | "transfer";
  asset?: Address;
  amount?: bigint;
  from?: Address;
  txHash?: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** order within same log (0,1 for transfer pair) */
  subIndex: number;
};

function logKey(log: Log) {
  return {
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash as Hex | undefined,
  };
}

/** Many public RPCs cap eth_getLogs range — walk in chunks. */
const LOG_CHUNK = 40_000n;

type DecodedLog = Log & {
  args?: Record<string, unknown>;
};

async function getLogsChunked(
  client: PublicClient,
  params: {
    address: Address;
    // viem event ABI fragment
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
  }
): Promise<DecodedLog[]> {
  const latest = await client.getBlockNumber();
  if (latest < params.fromBlock) return [];
  const out: DecodedLog[] = [];
  for (let start = params.fromBlock; start <= latest; start += LOG_CHUNK) {
    let end = start + LOG_CHUNK - 1n;
    if (end > latest) end = latest;
    const chunk = (await client.getLogs({
      address: params.address,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: params.event as any,
      fromBlock: start,
      toBlock: end,
    })) as DecodedLog[];
    out.push(...chunk);
  }
  return out;
}

export async function syncShieldTree(
  client: PublicClient
): Promise<SyncedTree | null> {
  if (!SHIELD_POOL_ADDRESS) return null;

  const [shieldLogs, transferLogs, sealedLogs] = await Promise.all([
    getLogsChunked(client, {
      address: SHIELD_POOL_ADDRESS,
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
    getLogsChunked(client, {
      address: SHIELD_POOL_ADDRESS,
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
    // Older pools have no SealedSwapped — empty on failure
    getLogsChunked(client, {
      address: SHIELD_POOL_ADDRESS,
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
  ]);

  const inserts: OrderedInsert[] = [];

  for (const log of shieldLogs) {
    const args = log.args as {
      commitment?: Hex;
      asset?: Address;
      amount?: bigint;
      from?: Address;
    };
    const meta = logKey(log);
    inserts.push({
      commitment: (args.commitment ??
        "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex,
      kind: "shield",
      asset: args.asset,
      amount: args.amount,
      from: args.from,
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
      subIndex: 0,
    });
  }

  for (const log of transferLogs) {
    const args = log.args as {
      newCommitments?: readonly [Hex, Hex];
    };
    const pair = args.newCommitments;
    if (!pair) continue;
    const meta = logKey(log);
    inserts.push({
      commitment: pair[0],
      kind: "transfer",
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
      subIndex: 0,
    });
    inserts.push({
      commitment: pair[1],
      kind: "transfer",
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
      subIndex: 1,
    });
  }

  // Sealed swap: out note then change note (same insert order as contract)
  for (const log of sealedLogs) {
    const args = log.args as {
      newCommitmentOut?: Hex;
      newCommitmentChange?: Hex;
      assetOut?: Address;
    };
    if (!args.newCommitmentOut || !args.newCommitmentChange) continue;
    const meta = logKey(log);
    inserts.push({
      commitment: args.newCommitmentOut,
      kind: "transfer",
      asset: args.assetOut,
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
      subIndex: 0,
    });
    inserts.push({
      commitment: args.newCommitmentChange,
      kind: "transfer",
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
      subIndex: 1,
    });
  }

  inserts.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber)
      return a.blockNumber < b.blockNumber ? -1 : 1;
    if (a.logIndex !== b.logIndex) return a.logIndex - b.logIndex;
    return a.subIndex - b.subIndex;
  });

  const leaves: ChainLeaf[] = [];
  const indexByCommitment = new Map<string, number>();

  if (HASH_SCHEME === "poseidon") {
    const tree = new IncrementalMerkleTreePoseidon();
    await tree.init();
    for (const ins of inserts) {
      const leafIndex = tree.nextIndex;
      await tree.insert(hexToField(ins.commitment));
      leaves.push({
        leafIndex,
        commitment: ins.commitment,
        kind: ins.kind,
        asset: ins.asset,
        amount: ins.amount,
        from: ins.from,
        txHash: ins.txHash,
        blockNumber: ins.blockNumber,
        logIndex: ins.logIndex,
      });
      indexByCommitment.set(ins.commitment.toLowerCase(), leafIndex);
    }
    return {
      scheme: "poseidon",
      leaves,
      root: fieldToHex(tree.currentRoot),
      leafCount: tree.nextIndex,
      indexByCommitment,
      pathForLeaf: async (i) => {
        try {
          return await tree.path(i);
        } catch {
          return null;
        }
      },
    };
  }

  const tree = new IncrementalMerkleTree();
  for (const ins of inserts) {
    const leafIndex = tree.nextIndex;
    tree.insert(ins.commitment);
    leaves.push({
      leafIndex,
      commitment: ins.commitment,
      kind: ins.kind,
      asset: ins.asset,
      amount: ins.amount,
      from: ins.from,
      txHash: ins.txHash,
      blockNumber: ins.blockNumber,
      logIndex: ins.logIndex,
    });
    indexByCommitment.set(ins.commitment.toLowerCase(), leafIndex);
  }

  return {
    scheme: "keccak",
    leaves,
    root: tree.currentRoot,
    leafCount: tree.nextIndex,
    indexByCommitment,
    pathForLeaf: async (i) => {
      try {
        return tree.path(i);
      } catch {
        return null;
      }
    },
  };
}

export async function assertTreeMatchesChain(
  client: PublicClient,
  synced: SyncedTree
): Promise<boolean> {
  if (!SHIELD_POOL_ADDRESS) return false;
  const onchain = (await client.readContract({
    address: SHIELD_POOL_ADDRESS,
    abi: shieldPoolAbi,
    functionName: "currentRoot",
  })) as Hex;
  return onchain.toLowerCase() === synced.root.toLowerCase();
}
