/**
 * ShieldPool — RH testnet.
 * keccak Phase-1 live pool OR Poseidon Phase-2 (env NEXT_PUBLIC_POSEIDON_SHIELD_POOL).
 */

import { zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";
import { TESTNET_STOCK_TOKENS } from "./tokens";
import { makeBoundNote } from "./note";
import {
  activeHashScheme,
  activePoolAddress,
  type HashScheme,
} from "./config";

/** Live keccak RH testnet deploy */
export const TESTNET_SHIELD_POOL =
  "0x2BD98196D90AB45D58843B4c8B8809aa34343d35" as const satisfies Address;

/** getLogs from pool deploy block (Poseidon default; override via env) */
export const SHIELD_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_SHIELD_DEPLOY_BLOCK ??
    (activeHashScheme() === "poseidon" ? "90260331" : "90232912")
);

export const HASH_SCHEME: HashScheme = activeHashScheme();

export const SHIELD_POOL_ADDRESS: Address | null = activePoolAddress();

/** Native ETH in the pool (asset address zero) */
export const NATIVE_ASSET = zeroAddress;

export const shieldPoolAbi = [
  {
    type: "function",
    name: "shield",
    stateMutability: "payable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nextIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposited",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "verifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
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
    name: "emergencyWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unshield",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "root", type: "bytes32" },
      { name: "nullifier", type: "bytes32" },
      { name: "asset", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "root", type: "bytes32" },
      { name: "nullifier", type: "bytes32" },
      { name: "newCommitments", type: "bytes32[2]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "PROOF_LAYOUT_VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "HASH_SCHEME",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "verifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isKnownRoot",
    stateMutability: "view",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
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
    name: "Unshielded",
    inputs: [
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
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
] as const;

/** RH L2 gas headroom */
export const SHIELD_GAS_LIMIT = 500_000n;
export const EMERGENCY_GAS_LIMIT = 200_000n;
export const APPROVE_GAS_LIMIT = 120_000n;

export function isShieldDeployed(): boolean {
  return Boolean(SHIELD_POOL_ADDRESS);
}

export function isNativeAsset(asset: string) {
  return !asset || asset.toLowerCase() === NATIVE_ASSET.toLowerCase();
}

export function assetLabel(asset: string): string {
  if (isNativeAsset(asset)) return "ETH";
  const t = TESTNET_STOCK_TOKENS.find(
    (x) => x.address.toLowerCase() === asset.toLowerCase()
  );
  return t?.symbol ?? shortAsset(asset);
}

export function assetDecimals(asset: string): number {
  if (isNativeAsset(asset)) return 18;
  const t = TESTNET_STOCK_TOKENS.find(
    (x) => x.address.toLowerCase() === asset.toLowerCase()
  );
  return t?.decimals ?? 18;
}

function shortAsset(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Bound note for shield() — keccak scheme (legacy live pool).
 * Poseidon notes: use makeBoundNotePoseidon from notePoseidon.ts
 */
export function makeNoteMaterial(
  amount: bigint,
  asset: Address = NATIVE_ASSET
): { secret: Hex; commitment: Hex; nullifier: Hex } {
  return makeBoundNote(amount, asset);
}

export type LocalNote = {
  id: string;
  chainId: number;
  pool: Address;
  asset: Address;
  amountWei: string;
  commitment: Hex;
  /** Empty when reconstructed from chain only */
  secret: Hex;
  /** Precomputed for unshield when secret is known */
  nullifier?: Hex;
  /** true when commitment binds secret+amount+asset */
  bound?: boolean;
  /** poseidon = circuit-compatible; keccak = live Phase-1 */
  scheme?: HashScheme;
  leafIndex?: number;
  txHash?: Hex;
  from?: Address;
  createdAt: number;
  status?: "open" | "recovered";
  /** local = browser secret; chain = public Shielded event */
  source?: "local" | "chain";
};

const NOTES_KEY = "gloam.shield.notes.v1";

export function confirmedNotes(notes: LocalNote[]): LocalNote[] {
  return notes.filter((n) => Boolean(n.txHash) && n.status !== "recovered");
}

/**
 * Notes you can still spend (have a local secret).
 * Includes imports (no txHash yet) and confirmed shields/transfers.
 * Excludes recovered and chain-history-only rows without a secret.
 * Excludes historic sender payment rows (id pay-*).
 */
export function activeSpendableNotes(notes: LocalNote[]): LocalNote[] {
  return notes.filter(
    (n) =>
      n.status !== "recovered" &&
      !n.id.startsWith("pay-") &&
      Boolean(n.secret) &&
      n.secret !== "0x" &&
      n.secret.length > 10
  );
}

/**
 * Retire payment notes wrongly saved on the sender (pre-audit bug).
 * Safe to call on every load.
 */
export function purgeSenderPaymentNotes(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return false;
    const all = JSON.parse(raw) as LocalNote[];
    if (!Array.isArray(all)) return false;
    let changed = false;
    const next = all.map((n) => {
      if (n?.id?.startsWith("pay-") && n.status !== "recovered") {
        changed = true;
        return { ...n, status: "recovered" as const };
      }
      return n;
    });
    if (changed) localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    return changed;
  } catch {
    return false;
  }
}

export type NotesBackup = {
  v: 1;
  type: "gloam-notes-backup";
  exportedAt: number;
  chainId: number;
  notes: LocalNote[];
};

/** Export spendable notes (secrets!) for device backup. */
export function exportNotesBackup(address?: string | null): NotesBackup {
  purgeSenderPaymentNotes();
  const notes = activeSpendableNotes(loadLocalNotes(address));
  return {
    v: 1,
    type: "gloam-notes-backup",
    exportedAt: Date.now(),
    chainId: PRODUCT_CHAIN_ID,
    notes,
  };
}

/** Merge a backup into local storage. Returns how many notes were added/updated. */
export function importNotesBackup(
  raw: string,
  address?: string | null
): { ok: true; count: number } | { ok: false; error: string } {
  try {
    const data = JSON.parse(raw) as NotesBackup;
    if (data?.type !== "gloam-notes-backup" || data.v !== 1) {
      return { ok: false, error: "Not a Gloam notes backup." };
    }
    if (data.chainId !== PRODUCT_CHAIN_ID) {
      return { ok: false, error: "Backup is for a different chain." };
    }
    if (!Array.isArray(data.notes)) {
      return { ok: false, error: "Backup has no notes." };
    }
    let count = 0;
    for (const n of data.notes) {
      if (!n?.secret || !n?.commitment || !n?.amountWei) continue;
      if (n.chainId !== PRODUCT_CHAIN_ID) continue;
      if (n.id?.startsWith("pay-")) continue;
      const note: LocalNote = {
        ...n,
        from: (address as Address | undefined) ?? n.from,
        status: n.status === "recovered" ? "recovered" : "open",
        source: "local",
        bound: n.bound ?? true,
      };
      if (note.status === "recovered") continue;
      saveLocalNote(note);
      count++;
    }
    return { ok: true, count };
  } catch {
    return { ok: false, error: "Could not parse backup JSON." };
  }
}

/** ETH only (native asset) — spendable notes only */
export function sumEthWei(notes: LocalNote[]): bigint {
  return activeSpendableNotes(notes)
    .filter((n) => isNativeAsset(n.asset))
    .reduce((s, n) => s + BigInt(n.amountWei || "0"), BigInt(0));
}

/** @deprecated use sumEthWei */
export function sumNoteWei(notes: LocalNote[]): bigint {
  return sumEthWei(notes);
}

export function sumByAsset(notes: LocalNote[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const n of activeSpendableNotes(notes)) {
    const k = n.asset.toLowerCase();
    m.set(k, (m.get(k) ?? BigInt(0)) + BigInt(n.amountWei || "0"));
  }
  return m;
}

export function markAllNotesRecovered(
  address?: string | null,
  asset?: Address | null
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as LocalNote[];
    const lower = address?.toLowerCase();
    const assetLower = asset?.toLowerCase();
    const next = all.map((n) => {
      if (n.chainId !== PRODUCT_CHAIN_ID) return n;
      if (lower && n.from && n.from.toLowerCase() !== lower) return n;
      if (!n.txHash) return n;
      if (assetLower && n.asset.toLowerCase() !== assetLower) return n;
      return { ...n, status: "recovered" as const };
    });
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadLocalNotes(address?: string | null): LocalNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as LocalNote[];
    if (!Array.isArray(all)) return [];
    const filtered = all.filter((n) => n.chainId === PRODUCT_CHAIN_ID);
    if (!address) return filtered;
    const lower = address.toLowerCase();
    return filtered.filter(
      (n) => !n.from || n.from.toLowerCase() === lower
    );
  } catch {
    return [];
  }
}

export function saveLocalNote(note: LocalNote) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const all: LocalNote[] = raw ? (JSON.parse(raw) as LocalNote[]) : [];
    const next = [note, ...all.filter((n) => n.id !== note.id)].slice(0, 100);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function updateLocalNote(
  id: string,
  patch: Partial<Pick<LocalNote, "leafIndex" | "txHash" | "status">>
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as LocalNote[];
    const next = all.map((n) => (n.id === id ? { ...n, ...patch } : n));
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Clear ghost balances after cash-out / private send when nullifier was spent. */
export function markNoteRecovered(id: string) {
  updateLocalNote(id, { status: "recovered" });
}

/** Merge browser notes with on-chain Shielded events (prefer local secrets). */
export function mergeNotes(
  local: LocalNote[],
  chain: LocalNote[]
): LocalNote[] {
  const byCommit = new Map<string, LocalNote>();

  for (const n of chain) {
    byCommit.set(n.commitment.toLowerCase(), n);
  }
  for (const n of local) {
    const k = n.commitment.toLowerCase();
    const existing = byCommit.get(k);
    if (!existing) {
      byCommit.set(k, { ...n, source: n.source ?? "local" });
      continue;
    }
    byCommit.set(k, {
      ...existing,
      ...n,
      secret: n.secret && n.secret !== "0x" ? n.secret : existing.secret,
      source: "local",
      status: n.status === "recovered" ? "recovered" : existing.status,
      leafIndex: n.leafIndex ?? existing.leafIndex,
      txHash: n.txHash ?? existing.txHash,
    });
  }

  return [...byCommit.values()].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
}

/** Pull Shielded events for a wallet (amounts public on deposit edge). */
export async function fetchChainShieldNotes(
  client: PublicClient,
  from: Address
): Promise<LocalNote[]> {
  if (!SHIELD_POOL_ADDRESS) return [];
  try {
    const latest = await client.getBlockNumber();
    const CHUNK = 40_000n;
    const logs: {
      args?: {
        commitment?: Hex;
        asset?: Address;
        amount?: bigint;
        leafIndex?: bigint;
        from?: Address;
      };
      transactionHash?: Hex | null;
    }[] = [];
    for (let start = SHIELD_DEPLOY_BLOCK; start <= latest; start += CHUNK) {
      let end = start + CHUNK - 1n;
      if (end > latest) end = latest;
      const chunk = await client.getLogs({
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
        args: { from },
        fromBlock: start,
        toBlock: end,
      });
      logs.push(...(chunk as typeof logs));
    }

    return logs.map((log, i) => {
      const args = log.args ?? {};
      const commitment = (args.commitment ??
        "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex;
      return {
        id: `chain-${log.transactionHash ?? i}-${args.leafIndex ?? i}`,
        chainId: PRODUCT_CHAIN_ID,
        pool: SHIELD_POOL_ADDRESS!,
        asset: (args.asset ?? NATIVE_ASSET) as Address,
        amountWei: (args.amount ?? BigInt(0)).toString(),
        commitment,
        // chain-only row — no spend secret (placeholder, not a key)
        secret: "0x" as Hex,
        leafIndex:
          args.leafIndex != null ? Number(args.leafIndex) : undefined,
        txHash: (log.transactionHash ?? undefined) as Hex | undefined,
        from: (args.from ?? from) as Address,
        createdAt: Date.now() - i,
        status: "open" as const,
        source: "chain" as const,
      };
    });
  } catch {
    return [];
  }
}
