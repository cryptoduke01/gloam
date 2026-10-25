/**
 * The vault's Merkle tree, rebuilt from chain for the membership paths a spend
 * needs. The same replay as the SDK's syncTree (Shielded inserts one leaf,
 * Transferred two, in log order), with three things an agent that pays often
 * needs:
 *
 * - A cache of the leaves already read (public data: commitments and the
 *   blocks they landed in), so each payment reads only the new blocks.
 * - Log ranges that adapt to the RPC: sepolia.base.org answers 200 blocks per
 *   getLogs, publicnode 50,000, others more. A refused range is split, using the
 *   limit the RPC names when it names one.
 * - One getLogs per range for all three events, a few ranges at a time.
 *
 * The rebuilt root is checked against the pool's currentRoot() at the block the
 * scan ended on. A cache that leads to another root is dropped and the tree is
 * read again from the deploy block; a fresh read that still does not match is
 * an error, never a guess.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodeEventLog, type Address, type Hex, type PublicClient } from "viem";
import { IncrementalMerkleTreePoseidon, fieldToHex, hexToField, type PoseidonMerklePath } from "@gloamtrade/sdk";

const POOL_EVENTS = [
  {
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
  {
    type: "event",
    name: "Transferred",
    inputs: [
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "newCommitments", type: "bytes32[2]", indexed: false },
    ],
  },
  {
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
] as const;

const CURRENT_ROOT_ABI = [
  { type: "function", name: "currentRoot", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

/** One leaf as cached: its commitment, where it landed, and how. */
export type CachedLeaf = {
  c: Hex;
  /** block, log index, position within the log (0 or 1 for a pair) */
  b: string;
  l: number;
  s: number;
  /** "d" deposit, "p" payment output, "x" change output, "t" trade output */
  k: "d" | "p" | "x" | "t";
  tx: Hex | null;
};

type CacheFile = { version: 1; chainId: number; pool: Address; toBlock: string; leaves: CachedLeaf[] };

export interface SyncedVault {
  root: Hex;
  leafCount: number;
  /** The block the tree was read at. */
  atBlock: bigint;
  pathForCommitment(commitment: Hex): Promise<PoseidonMerklePath | null>;
  /** The transaction that inserted a commitment, and how, when the tree knows. */
  leafInfo(commitment: Hex): { index: number; kind: CachedLeaf["k"]; tx: Hex | null } | null;
}

export interface TreeSyncOptions {
  /** Folder for the leaf cache. Without one, nothing is cached. */
  cacheDir?: string;
  /** First getLogs range to try. Default 10,000 blocks; shrinks to what the RPC allows. */
  chunk?: bigint;
  /** Ranges read at once. Default 6. */
  concurrency?: number;
  /** Leaves this close to the head are read again on the next sync instead of cached. Default 64 blocks. */
  confirmations?: bigint;
}

const RANGE_HINTS: RegExp[] = [
  /limited to a (\d+) range/i,
  /maximum block range:? (\d+)/i,
  /ranges over (\d+) blocks/i,
  /block range (?:is )?(?:too large|exceeds)[^\d]*(\d+)/i,
  /up to a (\d+) block range/i,
  /(\d+) block range/i,
];
const RANGE_ERROR =
  /range|too many|limit|exceed|response size|query timeout|413|logs matched|more than \d+/i;

function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { details?: unknown; shortMessage?: unknown; message?: unknown };
    return `${String(o.details ?? "")} ${String(o.shortMessage ?? "")} ${String(o.message ?? e)}`;
  }
  return String(e);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TreeSync {
  private chunk: bigint;
  private readonly concurrency: number;
  private readonly confirmations: bigint;

  constructor(
    private readonly client: PublicClient,
    private readonly vault: { chainId: number; pool: Address; deployBlock: bigint },
    private readonly opts: TreeSyncOptions = {}
  ) {
    this.chunk = opts.chunk ?? 10_000n;
    this.concurrency = Math.max(1, opts.concurrency ?? 6);
    this.confirmations = opts.confirmations ?? 64n;
  }

  /** The getLogs range this RPC has taken so far. */
  get logChunk(): bigint {
    return this.chunk;
  }

  private cachePath(): string | null {
    if (!this.opts.cacheDir) return null;
    return join(this.opts.cacheDir, `leaves.${this.vault.chainId}.${this.vault.pool.toLowerCase()}.json`);
  }

  private loadCache(): { toBlock: bigint; leaves: CachedLeaf[] } | null {
    const p = this.cachePath();
    if (!p || !existsSync(p)) return null;
    try {
      const f = JSON.parse(readFileSync(p, "utf8")) as CacheFile;
      if (f.version !== 1 || f.chainId !== this.vault.chainId || f.pool.toLowerCase() !== this.vault.pool.toLowerCase()) return null;
      return { toBlock: BigInt(f.toBlock), leaves: f.leaves };
    } catch {
      return null;
    }
  }

  private saveCache(leaves: CachedLeaf[], head: bigint) {
    const p = this.cachePath();
    if (!p) return;
    const safe = head > this.confirmations ? head - this.confirmations : 0n;
    const kept = leaves.filter((x) => BigInt(x.b) <= safe);
    const file: CacheFile = { version: 1, chainId: this.vault.chainId, pool: this.vault.pool, toBlock: safe.toString(), leaves: kept };
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(file));
    renameSync(tmp, p);
  }

  /** getLogs for [from, to], splitting the range until the RPC takes it. */
  private async logsIn(from: bigint, to: bigint, depth = 0): Promise<CachedLeaf[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        const logs = await this.client.getLogs({ address: this.vault.pool, events: POOL_EVENTS, fromBlock: from, toBlock: to });
        return logs.flatMap((log) => this.leavesOf(log as never));
      } catch (e) {
        const text = errText(e);
        if (/429|rate limit|too many requests/i.test(text) && attempt < 5) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        if (!RANGE_ERROR.test(text) || to <= from || depth > 24) throw e;
        for (const re of RANGE_HINTS) {
          const m = text.match(re);
          const n = m ? BigInt(m[1]!) : 0n;
          if (n > 0n && n < this.chunk) {
            this.chunk = n;
            break;
          }
        }
        const span = to - from + 1n;
        if (span > this.chunk) {
          const out: CachedLeaf[] = [];
          for (let s = from; s <= to; s += this.chunk) {
            const e2 = s + this.chunk - 1n > to ? to : s + this.chunk - 1n;
            out.push(...(await this.logsIn(s, e2, depth + 1)));
          }
          return out;
        }
        const mid = from + (to - from) / 2n;
        this.chunk = mid - from + 1n;
        return [...(await this.logsIn(from, mid, depth + 1)), ...(await this.logsIn(mid + 1n, to, depth + 1))];
      }
    }
  }

  private leavesOf(log: { data: Hex; topics: [Hex, ...Hex[]]; blockNumber: bigint | null; logIndex: number | null; transactionHash: Hex | null }): CachedLeaf[] {
    let decoded: { eventName: string; args: Record<string, unknown> };
    try {
      decoded = decodeEventLog({ abi: POOL_EVENTS, data: log.data, topics: log.topics }) as never;
    } catch {
      return [];
    }
    const b = (log.blockNumber ?? 0n).toString();
    const l = log.logIndex ?? 0;
    const tx = log.transactionHash ?? null;
    const a = decoded.args;
    if (decoded.eventName === "Shielded") return [{ c: a.commitment as Hex, b, l, s: 0, k: "d", tx }];
    if (decoded.eventName === "Transferred") {
      const pair = a.newCommitments as readonly [Hex, Hex];
      return [
        { c: pair[0], b, l, s: 0, k: "p", tx },
        { c: pair[1], b, l, s: 1, k: "x", tx },
      ];
    }
    if (decoded.eventName === "SealedSwapped") {
      return [
        { c: a.newCommitmentOut as Hex, b, l, s: 0, k: "t", tx },
        { c: a.newCommitmentChange as Hex, b, l, s: 1, k: "t", tx },
      ];
    }
    return [];
  }

  private async scan(from: bigint, to: bigint): Promise<CachedLeaf[]> {
    if (to < from) return [];
    const planned = this.chunk;
    const ranges: [bigint, bigint][] = [];
    for (let s = from; s <= to; s += planned) ranges.push([s, s + planned - 1n > to ? to : s + planned - 1n]);
    const out: CachedLeaf[] = [];
    for (let i = 0; i < ranges.length; i += this.concurrency) {
      const batch = await Promise.all(ranges.slice(i, i + this.concurrency).map(([a, b]) => this.logsIn(a, b)));
      for (const x of batch) out.push(...x);
      // The RPC named a smaller limit: plan what is left at that size, so it is read in parallel too.
      const next = ranges[i + this.concurrency];
      if (next && this.chunk < planned) return [...out, ...(await this.scan(next[0], to))];
    }
    return out;
  }

  private async build(leaves: CachedLeaf[], atBlock: bigint): Promise<SyncedVault> {
    const sorted = [...leaves].sort((x, y) => {
      const bx = BigInt(x.b);
      const by = BigInt(y.b);
      if (bx !== by) return bx < by ? -1 : 1;
      if (x.l !== y.l) return x.l - y.l;
      return x.s - y.s;
    });
    const tree = new IncrementalMerkleTreePoseidon();
    await tree.init();
    const index = new Map<string, { index: number; kind: CachedLeaf["k"]; tx: Hex | null }>();
    for (const leaf of sorted) {
      const i = tree.nextIndex;
      await tree.insert(hexToField(leaf.c));
      index.set(leaf.c.toLowerCase(), { index: i, kind: leaf.k, tx: leaf.tx });
    }
    return {
      root: fieldToHex(tree.currentRoot),
      leafCount: tree.nextIndex,
      atBlock,
      pathForCommitment: async (c) => {
        const hit = index.get(c.toLowerCase());
        if (!hit) return null;
        try {
          return await tree.path(hit.index);
        } catch {
          return null;
        }
      },
      leafInfo: (c) => index.get(c.toLowerCase()) ?? null,
    };
  }

  private async rootAt(block: bigint): Promise<Hex> {
    return (await this.client.readContract({ address: this.vault.pool, abi: CURRENT_ROOT_ABI, functionName: "currentRoot", blockNumber: block })) as Hex;
  }

  /** Read the tree up to the latest block, from the cache where it can. */
  async sync(): Promise<SyncedVault> {
    const head = await this.client.getBlockNumber({ cacheTime: 0 });
    const cached = this.loadCache();
    const onChain = await this.rootAt(head);
    if (cached && cached.toBlock <= head) {
      const fresh = await this.scan(cached.toBlock + 1n, head);
      const seen = new Set(cached.leaves.map((x) => `${x.b}:${x.l}:${x.s}`));
      const all = [...cached.leaves, ...fresh.filter((x) => !seen.has(`${x.b}:${x.l}:${x.s}`))];
      const synced = await this.build(all, head);
      if (synced.root.toLowerCase() === onChain.toLowerCase()) {
        this.saveCache(all, head);
        return synced;
      }
    }
    const all = await this.scan(this.vault.deployBlock, head);
    const synced = await this.build(all, head);
    if (synced.root.toLowerCase() !== onChain.toLowerCase()) {
      throw new Error(
        `The vault tree read from the RPC (${synced.leafCount} leaves) does not match the vault's root at block ${head}. The RPC may be missing logs. Try another RPC.`
      );
    }
    this.saveCache(all, head);
    return synced;
  }
}
