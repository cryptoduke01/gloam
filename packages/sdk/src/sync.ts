/**
 * Rebuild the ShieldPool Merkle tree from chain, so an app or agent can produce
 * the membership path a spend proof needs (unshield, private send). Every event
 * that inserts a leaf must be replayed in on-chain order, or the root will not
 * match after any transfer or swap has happened:
 *
 *   Shielded      -> one leaf  (commitment)
 *   Transferred   -> two leaves (payment, change) in that order
 *   SealedSwapped -> two leaves (out, change) in that order
 *
 * viem's PublicClient is injected (no RPC baked in), so the same helper serves
 * a browser app and a node signer.
 */

import type { Address, Hex, PublicClient } from "viem";
import {
  IncrementalMerkleTreePoseidon,
  type PoseidonMerklePath,
} from "./merkle.js";
import { fieldToHex, hexToField } from "./poseidon.js";

export type ChainLeaf = {
  leafIndex: number;
  commitment: Hex;
  /** How the leaf entered the tree. */
  kind: "shield" | "transfer";
  asset?: Address;
  amount?: bigint;
  from?: Address;
  txHash?: Hex;
  blockNumber?: bigint;
  logIndex?: number;
};

export interface SyncedTree {
  /** The rebuilt tree — call `.path(i)` yourself, or use the helpers below. */
  tree: IncrementalMerkleTreePoseidon;
  leaves: ChainLeaf[];
  root: Hex;
  leafCount: number;
  /** commitment (lowercased hex) -> leaf index */
  indexByCommitment: Map<string, number>;
  pathForLeaf(leafIndex: number): Promise<PoseidonMerklePath | null>;
  /** The ergonomic path: give a note's commitment, get its membership path. */
  pathForCommitment(commitment: Hex): Promise<PoseidonMerklePath | null>;
}

export interface SyncTreeParams {
  /** The pool address (no default: pass the network's pool, e.g. mainnetNetwork("tempo")!.pool or SEALED_VAULT on testnet). */
  pool: Address;
  /** Earliest block to scan. Default 0n; pass the deploy block to go faster. */
  fromBlock?: bigint;
  /** getLogs range per request. Many public RPCs cap this. Default 40_000. */
  chunkSize?: bigint;
}

type OrderedInsert = {
  commitment: Hex;
  kind: "shield" | "transfer";
  asset?: Address;
  amount?: bigint;
  from?: Address;
  txHash?: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** order within one log (0,1 for a leaf pair) */
  subIndex: number;
};

type MinimalEvent = {
  type: "event";
  name: string;
  inputs: readonly { name: string; type: string; indexed: boolean }[];
};

type DecodedLog = {
  args?: Record<string, unknown>;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
};

async function getLogsChunked(
  client: PublicClient,
  address: Address,
  event: MinimalEvent,
  fromBlock: bigint,
  chunkSize: bigint,
  toBlock?: bigint
): Promise<DecodedLog[]> {
  // Fresh every time: a cached head can miss a note made seconds before it is spent.
  const latest = toBlock ?? (await client.getBlockNumber({ cacheTime: 0 }));
  if (latest < fromBlock) return [];
  const out: DecodedLog[] = [];
  for (let start = fromBlock; start <= latest; start += chunkSize) {
    let end = start + chunkSize - 1n;
    if (end > latest) end = latest;
    const chunk = (await client.getLogs({
      address,
      event: event as never,
      fromBlock: start,
      toBlock: end,
    })) as DecodedLog[];
    out.push(...chunk);
  }
  return out;
}

const SHIELDED_EVENT: MinimalEvent = {
  type: "event",
  name: "Shielded",
  inputs: [
    { name: "commitment", type: "bytes32", indexed: true },
    { name: "asset", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "leafIndex", type: "uint256", indexed: false },
    { name: "from", type: "address", indexed: true },
  ],
};

const TRANSFERRED_EVENT: MinimalEvent = {
  type: "event",
  name: "Transferred",
  inputs: [
    { name: "nullifier", type: "bytes32", indexed: true },
    { name: "newCommitments", type: "bytes32[2]", indexed: false },
  ],
};

const SEALED_SWAPPED_EVENT: MinimalEvent = {
  type: "event",
  name: "SealedSwapped",
  inputs: [
    { name: "nullifier", type: "bytes32", indexed: true },
    { name: "assetIn", type: "address", indexed: true },
    { name: "assetOut", type: "address", indexed: true },
    { name: "newCommitmentOut", type: "bytes32", indexed: false },
    { name: "newCommitmentChange", type: "bytes32", indexed: false },
  ],
};

/** Every leaf-inserting event in a block range, in on-chain order. With no `toBlock`, each event reads up to its own head. */
async function readInserts(
  client: PublicClient,
  pool: Address,
  fromBlock: bigint,
  chunkSize: bigint,
  toBlock?: bigint
): Promise<OrderedInsert[]> {
  const [shieldLogs, transferLogs, sealedLogs] = await Promise.all([
    getLogsChunked(client, pool, SHIELDED_EVENT, fromBlock, chunkSize, toBlock),
    getLogsChunked(client, pool, TRANSFERRED_EVENT, fromBlock, chunkSize, toBlock),
    // Older pools have no SealedSwapped; treat a failure as empty.
    getLogsChunked(client, pool, SEALED_SWAPPED_EVENT, fromBlock, chunkSize, toBlock).catch(
      () => [] as DecodedLog[]
    ),
  ]);

  const inserts: OrderedInsert[] = [];
  const meta = (log: DecodedLog) => ({
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
    txHash: (log.transactionHash ?? undefined) as Hex | undefined,
  });

  for (const log of shieldLogs) {
    const a = log.args as {
      commitment?: Hex;
      asset?: Address;
      amount?: bigint;
      from?: Address;
    };
    if (!a?.commitment) continue;
    const m = meta(log);
    inserts.push({
      commitment: a.commitment,
      kind: "shield",
      asset: a.asset,
      amount: a.amount,
      from: a.from,
      txHash: m.txHash,
      blockNumber: m.blockNumber,
      logIndex: m.logIndex,
      subIndex: 0,
    });
  }

  for (const log of transferLogs) {
    const a = log.args as { newCommitments?: readonly [Hex, Hex] };
    const pair = a?.newCommitments;
    if (!pair) continue;
    const m = meta(log);
    inserts.push({ commitment: pair[0], kind: "transfer", ...m, subIndex: 0 });
    inserts.push({ commitment: pair[1], kind: "transfer", ...m, subIndex: 1 });
  }

  for (const log of sealedLogs) {
    const a = log.args as {
      newCommitmentOut?: Hex;
      newCommitmentChange?: Hex;
      assetOut?: Address;
    };
    if (!a?.newCommitmentOut || !a?.newCommitmentChange) continue;
    const m = meta(log);
    inserts.push({
      commitment: a.newCommitmentOut,
      kind: "transfer",
      asset: a.assetOut,
      ...m,
      subIndex: 0,
    });
    inserts.push({
      commitment: a.newCommitmentChange,
      kind: "transfer",
      ...m,
      subIndex: 1,
    });
  }

  inserts.sort((x, y) => {
    if (x.blockNumber !== y.blockNumber) return x.blockNumber < y.blockNumber ? -1 : 1;
    if (x.logIndex !== y.logIndex) return x.logIndex - y.logIndex;
    return x.subIndex - y.subIndex;
  });
  return inserts;
}

/** A tree and what it takes to answer for it. */
type TreeState = {
  tree: IncrementalMerkleTreePoseidon;
  leaves: ChainLeaf[];
  indexByCommitment: Map<string, number>;
};

async function emptyState(): Promise<TreeState> {
  const tree = new IncrementalMerkleTreePoseidon();
  await tree.init();
  return { tree, leaves: [], indexByCommitment: new Map() };
}

const copyState = (s: TreeState): TreeState => ({
  tree: s.tree.clone(),
  leaves: s.leaves.slice(),
  indexByCommitment: new Map(s.indexByCommitment),
});

async function insertAll({ tree, leaves, indexByCommitment }: TreeState, inserts: OrderedInsert[]) {
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
}

function syncedView({ tree, leaves, indexByCommitment }: TreeState): SyncedTree {
  const pathForLeaf = async (i: number) => {
    try {
      return await tree.path(i);
    } catch {
      return null;
    }
  };

  return {
    tree,
    leaves,
    root: fieldToHex(tree.currentRoot),
    leafCount: tree.nextIndex,
    indexByCommitment,
    pathForLeaf,
    pathForCommitment: async (commitment: Hex) => {
      const i = indexByCommitment.get(commitment.toLowerCase());
      return i === undefined ? null : pathForLeaf(i);
    },
  };
}

/**
 * Rebuild the pool's tree from chain. After this, `pathForCommitment(note.commitment)`
 * gives you the `path` that `buildUnshieldIntent` / `buildPrivateSendIntent` want.
 */
export async function syncTree(
  client: PublicClient,
  params: SyncTreeParams
): Promise<SyncedTree> {
  const inserts = await readInserts(client, params.pool, params.fromBlock ?? 0n, params.chunkSize ?? 40_000n);
  const state = await emptyState();
  await insertAll(state, inserts);
  return syncedView(state);
}

const CURRENT_ROOT_ABI = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

/** Reads of the blocks since the last one before a kept tree is given up, and looks at the root after a full read. */
const KEEP_TRIES = 3;

export interface KeepTreeOptions {
  /** Wait between tries, for a node behind the one that gave the head. Default 1000 ms. */
  retryMs?: number;
}

/**
 * syncTree that keeps each pool's tree between reads, so a read costs the blocks
 * since the last one and not the pool's whole history. On a mainnet that is the
 * difference between a second and a minute and a half.
 *
 * A kept tree only moves to a block when its root equals the pool's currentRoot at
 * exactly that block. A root the pool merely once had would not do: a read that
 * missed a leaf still has a valid older root, and would then skip that leaf for
 * good. Anything that doesn't match (a node behind, a reorg) is read again, then
 * rebuilt from nothing, so the worst case is what syncTree costs anyway, and what
 * can't be proved is returned as syncTree would return it and never kept.
 *
 * All three events are read up to one head, so no block is half read. A tree is
 * kept per chain as well as per pool, since a vault has the same address on every
 * chain. Each caller gets its own copy, so a tree already handed out never changes,
 * and reads of one pool run one at a time.
 */
export function keepTree(options: KeepTreeOptions = {}): typeof syncTree {
  const retryMs = options.retryMs ?? 1_000;
  const kept = new Map<string, TreeState & { syncedTo: bigint }>();
  const queues = new Map<string, Promise<unknown>>();
  const wait = () => new Promise((r) => setTimeout(r, retryMs));

  const provedAt = async (client: PublicClient, pool: Address, state: TreeState, block: bigint) => {
    const onchain = await client
      .readContract({ address: pool, abi: CURRENT_ROOT_ABI, functionName: "currentRoot", blockNumber: block })
      .catch(() => null);
    return onchain?.toLowerCase() === fieldToHex(state.tree.currentRoot).toLowerCase();
  };

  async function read(client: PublicClient, params: SyncTreeParams, key: string): Promise<SyncedTree> {
    const { pool } = params;
    const chunkSize = params.chunkSize ?? 40_000n;
    const keep = (state: TreeState, syncedTo: bigint) => {
      kept.set(key, { ...state, syncedTo });
      return syncedView(copyState(state));
    };

    const base = kept.get(key);
    if (base) {
      for (let tries = 0; tries < KEEP_TRIES; tries++) {
        if (tries) await wait();
        const head = await client.getBlockNumber({ cacheTime: 0 });
        // This node is behind the block the tree was proved at, so it has nothing to add.
        if (head < base.syncedTo) return syncedView(copyState(base));
        const next = copyState(base);
        await insertAll(next, await readInserts(client, pool, base.syncedTo + 1n, chunkSize, head));
        if (await provedAt(client, pool, next, head)) return keep(next, head);
      }
      kept.delete(key);
    }

    const head = await client.getBlockNumber({ cacheTime: 0 });
    const state = await emptyState();
    await insertAll(state, await readInserts(client, pool, params.fromBlock ?? 0n, chunkSize, head));
    for (let tries = 0; tries < KEEP_TRIES; tries++) {
      if (tries) await wait();
      if (await provedAt(client, pool, state, head)) return keep(state, head);
    }
    return syncedView(state);
  }

  return async (client, params) => {
    const key = `${await client.getChainId()}:${params.pool.toLowerCase()}:${params.fromBlock ?? 0n}`;
    const run = (queues.get(key) ?? Promise.resolve()).then(() => read(client, params, key));
    queues.set(key, run.catch(() => undefined));
    return run;
  };
}

/**
 * True if the rebuilt tree's root equals the pool's on-chain `currentRoot()`.
 * A cheap integrity check before you trust a path.
 */
export async function assertTreeMatchesChain(
  client: PublicClient,
  pool: Address,
  synced: SyncedTree
): Promise<boolean> {
  try {
    const onchain = (await client.readContract({
      address: pool,
      abi: CURRENT_ROOT_ABI,
      functionName: "currentRoot",
    })) as Hex;
    return onchain.toLowerCase() === synced.root.toLowerCase();
  } catch {
    return false;
  }
}
