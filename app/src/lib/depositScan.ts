/**
 * A wallet's own deposits into a vault (its Shielded logs), read from the
 * chain and kept for the tab, so a page load after the first only reads the
 * blocks since the last one instead of walking from the vault's deploy block.
 * On Tempo testnet that walk was about 40 log reads and 9 to 11 s on every
 * load of the vault (measured 26 Oct 2026); after it, one read.
 *
 * The saved part ends `RESCAN_OVERLAP` blocks below the head it was read at,
 * so the newest blocks are always read again (a reorganised block can't leave
 * a deposit behind). A long first walk is saved in parts as it goes, so a
 * reload halfway resumes. It is kept per chain, vault and wallet, in memory and in
 * sessionStorage, like the wallet's public activity (lib/walletActivity): the
 * same public logs anyone can read for this address, and gone with the tab.
 * A saved copy that does not parse, or is for another chain, vault or wallet,
 * is never used. Concurrent callers share one read.
 */

import type { Address, Hex, PublicClient } from "viem";
import { walkLogs, walkTuning } from "./leafIndex";
import type { GloamNetwork } from "./networks";

/** One Shielded log of this wallet, as much of it as a note row needs. */
export type DepositRow = {
  commitment: Hex;
  asset: Address;
  amount: string;
  leafIndex: number | null;
  txHash: Hex | null;
  /** Block it landed in. */
  bn: string;
};

type Saved = { v: 1; toBlock: string; rows: DepositRow[] };

const PREFIX = "gloam.deposits.v1:";
/** Blocks below the head that are read again on every load. */
export const RESCAN_OVERLAP = 128n;
/** A first walk is saved every this many rounds of reads (rounds of `parallel` spans). */
const PART_ROUNDS = 3;

const SHIELDED = {
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

const memory = new Map<string, Saved>();
const inflight = new Map<string, Promise<DepositRow[]>>();

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^\d{1,78}$/;

function keyOf(net: Pick<GloamNetwork, "chainId">, pool: Address, from: Address): string {
  return `${PREFIX}${net.chainId}:${pool.toLowerCase()}:${from.toLowerCase()}`;
}

function validRow(r: unknown): r is DepositRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.commitment === "string" && HEX32.test(o.commitment) &&
    typeof o.asset === "string" && ADDR.test(o.asset) &&
    typeof o.amount === "string" && UINT.test(o.amount) &&
    (o.leafIndex === null || (typeof o.leafIndex === "number" && Number.isSafeInteger(o.leafIndex) && o.leafIndex >= 0)) &&
    (o.txHash === null || (typeof o.txHash === "string" && HEX32.test(o.txHash))) &&
    typeof o.bn === "string" && UINT.test(o.bn)
  );
}

/** A saved scan, only if every part of it parses and no row is past its end. */
export function parseSaved(raw: unknown): Saved | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.toBlock !== "string" || !UINT.test(o.toBlock) || !Array.isArray(o.rows)) return null;
  if (!o.rows.every(validRow)) return null;
  const to = BigInt(o.toBlock);
  if ((o.rows as DepositRow[]).some((r) => BigInt(r.bn) > to)) return null;
  return { v: 1, toBlock: o.toBlock, rows: o.rows as DepositRow[] };
}

function load(k: string): Saved | null {
  const m = memory.get(k);
  if (m) return m;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(k);
    const s = raw ? parseSaved(JSON.parse(raw)) : null;
    if (s) memory.set(k, s);
    return s;
  } catch {
    return null;
  }
}

function save(k: string, s: Saved) {
  memory.set(k, s);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(k, JSON.stringify(s));
  } catch {
    /* storage full or blocked: memory still has it */
  }
}

/** Forget every saved scan (a test, or a wallet reset). */
export function clearDepositScans() {
  memory.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

type ScanClient = Pick<PublicClient, "getBlockNumber" | "getLogs">;

/**
 * Every Shielded log of `from` in `net`'s vault, oldest first. Reads from the
 * end of the saved scan (or the deploy block) to the head; throws when the
 * chain can't be read.
 */
export function scanDeposits(client: ScanClient, net: Pick<GloamNetwork, "chainId" | "pool" | "deployBlock" | "logRange">, from: Address): Promise<DepositRow[]> {
  const pool = net.pool;
  if (!pool) return Promise.resolve([]);
  const k = keyOf(net, pool, from);
  const running = inflight.get(k);
  if (running) return running;
  const p = scan(client, net, pool, from, k).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

async function scan(
  client: ScanClient,
  net: Pick<GloamNetwork, "chainId" | "deployBlock" | "logRange">,
  pool: Address,
  from: Address,
  k: string
): Promise<DepositRow[]> {
  const deploy = net.deployBlock ?? 0n;
  const saved = load(k);
  const savedTo = saved ? BigInt(saved.toBlock) : null;
  const start = savedTo !== null && savedTo >= deploy ? savedTo + 1n : deploy;
  const prior = savedTo !== null && savedTo >= deploy ? saved!.rows : [];
  const latest = await client.getBlockNumber();
  const tuning = walkTuning(net.chainId, net.logRange);
  // keep what is RESCAN_OVERLAP below the head; the newest blocks are read again next time
  const keepTo = latest - RESCAN_OVERLAP;
  let rows = prior;
  let kept = savedTo;
  // A long first walk goes in parts, each saved as it ends, so a reload halfway
  // starts where it stopped instead of at the deploy block again.
  const part = tuning.span * BigInt(tuning.parallel * PART_ROUNDS);
  for (let a = start; a <= latest; a += part) {
    const b = a + part - 1n < latest ? a + part - 1n : latest;
    // this wallet's deposits only, in the chain's widest ranges and a few at a time
    // (lib/leafIndex): a handful of calls on Robinhood Chain instead of one per 100k blocks
    const logs = (await walkLogs(client as PublicClient, pool, a, b, tuning, {
      event: SHIELDED as never,
      args: { from },
    })) as unknown as {
      args?: { commitment?: Hex; asset?: Address; amount?: bigint; leafIndex?: bigint };
      transactionHash?: Hex | null;
      blockNumber?: bigint | null;
    }[];
    rows = rows.concat(
      logs.map((log) => {
        const x = log.args ?? {};
        return {
          commitment: (x.commitment ?? `0x${"0".repeat(64)}`) as Hex,
          asset: (x.asset ?? "0x0000000000000000000000000000000000000000") as Address,
          amount: (x.amount ?? 0n).toString(),
          leafIndex: x.leafIndex != null ? Number(x.leafIndex) : null,
          txHash: log.transactionHash ?? null,
          bn: (log.blockNumber ?? b).toString(),
        };
      })
    );
    const upTo = b < keepTo ? b : keepTo;
    if (upTo >= deploy && (kept === null || upTo > kept)) {
      save(k, { v: 1, toBlock: upTo.toString(), rows: rows.filter((r) => BigInt(r.bn) <= upTo) });
      kept = upTo;
    }
  }
  return rows;
}
