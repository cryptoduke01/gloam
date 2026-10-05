/**
 * Rebuild ShieldPool Merkle tree from on-chain insertions:
 *   - Shielded → one leaf (commitment)
 *   - Transferred → two leaves (payment, change) in that order
 *   - SealedSwapped → two leaves (out, change) in that order
 *
 * Private send only emits Transferred; private trade only SealedSwapped, * ignoring either makes root mismatch after those txs.
 */

import type { Address, Hex, PublicClient } from "viem";
import { HASH_SCHEME, shieldPoolAbi } from "./shield";
import { getActiveNetwork } from "./networks";
import { IncrementalMerkleTree } from "./merkle";
import { IncrementalMerkleTreePoseidon } from "./merklePoseidon";
import type { MerklePath } from "./merkle";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { fieldToHex, hexToField } from "./poseidon";
import { readDemo } from "./demoFlag";
import { demoSyncedTree } from "./demo/chain";

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

// ------------------------------------------------------------------ log fetch

const SHIELDED_EVENT = {
  type: "event",
  name: "Shielded",
  inputs: [
    { name: "commitment", type: "bytes32", indexed: true },
    { name: "asset", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "leafIndex", type: "uint256", indexed: false },
    { name: "from", type: "address", indexed: true },
  ],
} as const;
const TRANSFERRED_EVENT = {
  type: "event",
  name: "Transferred",
  inputs: [
    { name: "nullifier", type: "bytes32", indexed: true },
    { name: "newCommitments", type: "bytes32[2]", indexed: false },
  ],
} as const;
// Older pools have no SealedSwapped; it simply never matches there.
const SEALED_EVENT = {
  type: "event",
  name: "SealedSwapped",
  inputs: [
    { name: "nullifier", type: "bytes32", indexed: true },
    { name: "assetIn", type: "address", indexed: true },
    { name: "assetOut", type: "address", indexed: true },
    { name: "newCommitmentOut", type: "bytes32", indexed: false },
    { name: "newCommitmentChange", type: "bytes32", indexed: false },
  ],
} as const;
const POOL_EVENTS = [SHIELDED_EVENT, TRANSFERRED_EVENT, SEALED_EVENT] as const;

/**
 * One pool insertion event in a compact, JSON-safe form (public chain data
 * only: commitments, and for deposits the public asset/amount/depositor).
 */
type RawInsert = {
  /** s = shield, t = private send, w = sealed swap */
  k: "s" | "t" | "w";
  /** commitments in the order the contract inserts them */
  c: Hex[];
  a?: Address;
  v?: string;
  f?: Address;
  tx?: Hex;
  bn: string;
  li: number;
};

type PoolLogCache = { toBlock: string; items: RawInsert[] };

/**
 * Incremental, persisted log cache per pool. The first visit walks the chain
 * once; after that every sync (page loads, each payroll payment) only fetches
 * blocks since the last one, with a small overlap for late logs. Requests for
 * all three events share one eth_getLogs per block range, sized to what each
 * RPC allows. Concurrent callers share a single in-flight sync.
 */
const memCache = new Map<string, PoolLogCache>();
const inflight = new Map<string, Promise<SyncedTree | null>>();
const REORG_OVERLAP = 64n;
const STORE_PREFIX = "gloam.tree.v1:";

function readPersisted(key: string): PoolLogCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as PoolLogCache;
    return v && typeof v.toBlock === "string" && Array.isArray(v.items) ? v : null;
  } catch {
    return null;
  }
}

function writePersisted(key: string, cache: PoolLogCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(cache));
  } catch {
    /* quota or private mode: in-memory cache still works */
  }
}

/** Drop the cached tree for the active pool (forces a full walk next sync). */
export function resetTreeCache() {
  const net = getActiveNetwork();
  if (!net.pool) return;
  const key = `${net.chainId}:${net.pool.toLowerCase()}`;
  memCache.delete(key);
  try {
    window.localStorage.removeItem(STORE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

async function fetchInserts(
  client: PublicClient,
  pool: Address,
  fromBlock: bigint,
  toBlock: bigint,
  range: bigint
): Promise<RawInsert[]> {
  const out: RawInsert[] = [];
  for (let start = fromBlock; start <= toBlock; start += range) {
    const end = start + range - 1n > toBlock ? toBlock : start + range - 1n;
    const logs = await client.getLogs({
      address: pool,
      events: POOL_EVENTS,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      const base = {
        tx: (log.transactionHash ?? undefined) as Hex | undefined,
        bn: (log.blockNumber ?? 0n).toString(),
        li: log.logIndex ?? 0,
      };
      if (log.eventName === "Shielded") {
        const a = log.args;
        if (!a.commitment) continue;
        out.push({ ...base, k: "s", c: [a.commitment], a: a.asset, v: a.amount?.toString(), f: a.from });
      } else if (log.eventName === "Transferred") {
        const pair = log.args.newCommitments;
        if (!pair) continue;
        out.push({ ...base, k: "t", c: [pair[0], pair[1]] });
      } else if (log.eventName === "SealedSwapped") {
        const a = log.args;
        if (!a.newCommitmentOut || !a.newCommitmentChange) continue;
        out.push({ ...base, k: "w", c: [a.newCommitmentOut, a.newCommitmentChange], a: a.assetOut });
      }
    }
  }
  return out;
}

function mergeInserts(prev: RawInsert[], next: RawInsert[]): RawInsert[] {
  const seen = new Set(prev.map((r) => `${r.tx}:${r.li}`));
  const out = prev.slice();
  for (const r of next) {
    const k = `${r.tx}:${r.li}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function syncShieldTree(client: PublicClient): Promise<SyncedTree | null> {
  // Recording demo: the pretend wallet's tree, nothing read from the chain.
  if (readDemo()) return Promise.resolve(demoSyncedTree());
  const net = getActiveNetwork();
  const pool = net.pool;
  if (!pool) return Promise.resolve(null);
  const key = `${net.chainId}:${pool.toLowerCase()}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = syncOnce(client, key, pool, net.deployBlock ?? 0n, net.logRange, true).finally(() =>
    inflight.delete(key)
  );
  inflight.set(key, p);
  return p;
}

async function syncOnce(
  client: PublicClient,
  key: string,
  pool: Address,
  deployBlock: bigint,
  range: bigint,
  allowRetry: boolean
): Promise<SyncedTree | null> {
  const cached = memCache.get(key) ?? readPersisted(key);
  const latest = await client.getBlockNumber();
  const cachedTo = cached ? BigInt(cached.toBlock) : null;
  const fromBlock =
    cachedTo != null && cachedTo - REORG_OVERLAP > deployBlock ? cachedTo - REORG_OVERLAP : deployBlock;
  const fresh = await fetchInserts(client, pool, fromBlock, latest, range);
  const items = cached ? mergeInserts(cached.items, fresh) : fresh;
  const next: PoolLogCache = { toBlock: latest.toString(), items };

  const tree = await buildTree(items);
  // Self-check: the rebuilt root must be one the pool has seen. If a cached
  // walk ever went wrong, drop it and rebuild from the deploy block once.
  if (cached && allowRetry) {
    const known = await client
      .readContract({ address: pool, abi: shieldPoolAbi, functionName: "isKnownRoot", args: [tree.root] })
      .catch(() => true);
    if (!known) {
      memCache.delete(key);
      try {
        window.localStorage.removeItem(STORE_PREFIX + key);
      } catch {
        /* ignore */
      }
      return syncOnce(client, key, pool, deployBlock, range, false);
    }
  }
  memCache.set(key, next);
  writePersisted(key, next);
  return tree;
}

async function buildTree(items: RawInsert[]): Promise<SyncedTree> {
  const inserts: OrderedInsert[] = [];
  for (const r of items) {
    const blockNumber = BigInt(r.bn);
    r.c.forEach((commitment, subIndex) => {
      inserts.push({
        commitment,
        kind: r.k === "s" ? "shield" : "transfer",
        asset: r.k === "s" ? r.a : subIndex === 0 ? r.a : undefined,
        amount: r.k === "s" && r.v != null ? BigInt(r.v) : undefined,
        from: r.k === "s" ? r.f : undefined,
        txHash: r.tx,
        blockNumber,
        logIndex: r.li,
        subIndex,
      });
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
  if (readDemo()) return true;
  const pool = getActiveNetwork().pool;
  if (!pool) return false;
  const onchain = (await client.readContract({
    address: pool,
    abi: shieldPoolAbi,
    functionName: "currentRoot",
  })) as Hex;
  return onchain.toLowerCase() === synced.root.toLowerCase();
}
