/**
 * Product config: keccak Phase-1 pool vs Poseidon Phase-2 pool.
 */

import type { Address } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";

export type HashScheme = "keccak" | "poseidon";

/** Legacy live pool */
export const KECCAK_POOL =
  "0x2BD98196D90AB45D58843B4c8B8809aa34343d35" as const satisfies Address;

/** Filled after phase-2 deploy / env */
export const POSEIDON_POOL: Address | null = (() => {
  const e = process.env.NEXT_PUBLIC_POSEIDON_SHIELD_POOL;
  if (e && e.startsWith("0x") && e.length === 42) return e as Address;
  return null;
})();

/**
 * Which pool the product uses.
 * Prefer Poseidon when address is set (env or future default).
 */
export function activeHashScheme(): HashScheme {
  const forced = process.env.NEXT_PUBLIC_HASH_SCHEME as HashScheme | undefined;
  if (forced === "poseidon" || forced === "keccak") return forced;
  if (POSEIDON_POOL) return "poseidon";
  return "keccak";
}

export function activePoolAddress(): Address | null {
  if (activeHashScheme() === "poseidon" && POSEIDON_POOL) {
    return POSEIDON_POOL;
  }
  if (PRODUCT_CHAIN_ID === 46630) {
    const e = process.env.NEXT_PUBLIC_SHIELD_POOL_ADDRESS;
    if (e && e.startsWith("0x") && e.length === 42) return e as Address;
    return KECCAK_POOL;
  }
  return null;
}

export const UNSHIELD_ENABLED =
  process.env.NEXT_PUBLIC_UNSHIELD_ENABLED === "true" ||
  activeHashScheme() === "poseidon";
