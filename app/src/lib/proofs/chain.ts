/**
 * On-chain checks behind verifyProof. Reads only, against the network the proof
 * names (not the network the viewer has selected), with one public client per
 * chain. Pool events are matched here because a payment note can come from a
 * deposit (Shielded), a private send (Transferred) or a trade (SealedSwapped).
 */
import { createPublicClient, http, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { getNetwork, NETWORK_KEYS, type GloamNetwork } from "@/lib/networks";

const POOL_ABI = [
  {
    type: "function",
    name: "isKnownRoot",
    stateMutability: "view",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "isSpent",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "commitmentSeen",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const NOTE_EVENTS = [
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

/** How far back a payment is looked up when the proof carries no tx hash. */
const MAX_SCAN_CHUNKS = 24;
const SCAN_PARALLEL = 4;

export function networkForChain(chainId: number): GloamNetwork | null {
  for (const key of NETWORK_KEYS) {
    const n = getNetwork(key);
    if (n.chainId === chainId) return n;
  }
  return null;
}

const clients = new Map<number, PublicClient>();

export function clientFor(net: GloamNetwork): PublicClient {
  const existing = clients.get(net.chainId);
  if (existing) return existing;
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.chain.rpcUrls.default.http[0], { timeout: 25_000, retryCount: 2 }),
  });
  clients.set(net.chainId, client);
  return client;
}

export function isKnownRoot(client: PublicClient, pool: Address, root: Hex): Promise<boolean> {
  return client.readContract({ address: pool, abi: POOL_ABI, functionName: "isKnownRoot", args: [root] });
}

export function isSpent(client: PublicClient, pool: Address, nullifier: Hex): Promise<boolean> {
  return client.readContract({ address: pool, abi: POOL_ABI, functionName: "isSpent", args: [nullifier] });
}

export function commitmentSeen(client: PublicClient, pool: Address, commitment: Hex): Promise<boolean> {
  return client.readContract({ address: pool, abi: POOL_ABI, functionName: "commitmentSeen", args: [commitment] });
}

type PoolLog = {
  eventName: "Shielded" | "Transferred" | "SealedSwapped";
  args: Record<string, unknown>;
  address: Address;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
};

function createsNote(log: PoolLog, commitment: string): boolean {
  const a = log.args;
  const hits = (v: unknown) => typeof v === "string" && v.toLowerCase() === commitment;
  if (log.eventName === "Shielded") return hits(a.commitment);
  if (log.eventName === "Transferred") {
    return Array.isArray(a.newCommitments) && a.newCommitments.some(hits);
  }
  return hits(a.newCommitmentOut) || hits(a.newCommitmentChange);
}

/** How a note entered the vault: a holder's own deposit, a private payment, or a private trade. */
export type NoteOrigin = "deposit" | "payment" | "trade";

const ORIGIN: Record<PoolLog["eventName"], NoteOrigin> = {
  Shielded: "deposit",
  Transferred: "payment",
  SealedSwapped: "trade",
};

export type NoteTx =
  | { state: "found"; txHash: Hex; blockNumber: bigint; paidAt: number; origin: NoteOrigin }
  /** The named transaction exists but did not create this note in this pool. */
  | { state: "mismatch" }
  /** Not in the named transaction's chain, or older than the bounded scan. */
  | { state: "not-found" };

async function found(client: PublicClient, log: PoolLog, txHash: Hex, blockNumber: bigint): Promise<NoteTx> {
  const block = await client.getBlock({ blockNumber });
  return { state: "found", txHash, blockNumber, paidAt: Number(block.timestamp), origin: ORIGIN[log.eventName] };
}

/**
 * The transaction that put `commitment` in the pool, and when it landed. With a
 * tx hash, that receipt is read and must contain the note (else "mismatch");
 * without one, recent blocks are scanned newest first, at most MAX_SCAN_CHUNKS
 * eth_getLogs ranges of the network's allowed size (Tempo caps at 100k blocks).
 */
export async function findNoteTx(
  client: PublicClient,
  net: GloamNetwork,
  pool: Address,
  commitment: Hex,
  txHash: Hex | null
): Promise<NoteTx> {
  const want = commitment.toLowerCase();
  const poolLower = pool.toLowerCase();

  if (txHash) {
    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt) return { state: "not-found" };
    if (receipt.status !== "success") return { state: "mismatch" };
    const logs = parseEventLogs({ abi: NOTE_EVENTS, logs: receipt.logs }) as unknown as PoolLog[];
    const hit = logs.find((l) => l.address.toLowerCase() === poolLower && createsNote(l, want));
    return hit ? found(client, hit, txHash, receipt.blockNumber) : { state: "mismatch" };
  }

  const latest = await client.getBlockNumber();
  const floor = net.deployBlock ?? 0n;
  const range = net.logRange;
  const chunks: [bigint, bigint][] = [];
  for (let end = latest; end >= floor && chunks.length < MAX_SCAN_CHUNKS; end -= range) {
    const start = end - range + 1n > floor ? end - range + 1n : floor;
    chunks.push([start, end]);
    if (start === floor) break;
  }
  for (let i = 0; i < chunks.length; i += SCAN_PARALLEL) {
    const batch = await Promise.all(
      chunks.slice(i, i + SCAN_PARALLEL).map(([fromBlock, toBlock]) =>
        client.getLogs({ address: pool, events: NOTE_EVENTS, fromBlock, toBlock })
      )
    );
    // Batches run newest first, so the first hit is the one to report.
    for (const logs of batch) {
      const hit = (logs as unknown as PoolLog[]).find((l) => createsNote(l, want));
      if (hit?.transactionHash && hit.blockNumber != null) {
        return found(client, hit, hit.transactionHash, hit.blockNumber);
      }
    }
  }
  return { state: "not-found" };
}
