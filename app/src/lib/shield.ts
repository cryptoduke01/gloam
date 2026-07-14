/**
 * ShieldPool — Robinhood Chain testnet (phase 1: custody + Merkle leaf).
 * Private transfer / unshield need a real verifier (not deployed yet).
 */

import { keccak256, toHex, zeroAddress, type Address, type Hex } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";

/** Live RH testnet deploy (see contracts/deployments/testnet.json) */
export const TESTNET_SHIELD_POOL =
  "0x2BD98196D90AB45D58843B4c8B8809aa34343d35" as const satisfies Address;

export const SHIELD_POOL_ADDRESS: Address | null = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_SHIELD_POOL_ADDRESS;
  if (
    fromEnv &&
    fromEnv !== "null" &&
    fromEnv.startsWith("0x") &&
    fromEnv.length === 42
  ) {
    return fromEnv as Address;
  }
  // Product is testnet-only — default to the live pool
  if (PRODUCT_CHAIN_ID === 46630) return TESTNET_SHIELD_POOL;
  return null;
})();

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
] as const;

/** RH L2 gas headroom — forge under-estimates multi-tx; wallets vary */
export const SHIELD_GAS_LIMIT = 500_000n;

export function isShieldDeployed(): boolean {
  return Boolean(SHIELD_POOL_ADDRESS);
}

/** Fresh random secret + commitment for a phase-1 note */
export function makeNoteMaterial(): { secret: Hex; commitment: Hex } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = toHex(bytes);
  const commitment = keccak256(secret);
  return { secret, commitment };
}

export type LocalNote = {
  id: string;
  chainId: number;
  pool: Address;
  asset: Address;
  amountWei: string;
  commitment: Hex;
  secret: Hex;
  leafIndex?: number;
  txHash?: Hex;
  from?: Address;
  createdAt: number;
};

const NOTES_KEY = "gloam.shield.notes.v1";

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
  patch: Partial<Pick<LocalNote, "leafIndex" | "txHash">>
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
