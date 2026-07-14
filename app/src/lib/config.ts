/**
 * Product config: keccak Phase-1 pool vs Poseidon Phase-2 pool.
 * Default product path = Poseidon (unshield enabled) on RH testnet.
 */

import type { Address } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";

export type HashScheme = "keccak" | "poseidon";

/** Legacy Phase-1 pool (no verifier) */
export const KECCAK_POOL =
  "0x2BD98196D90AB45D58843B4c8B8809aa34343d35" as const satisfies Address;

/** Phase-2 Poseidon pool — live RH testnet (see deployments/poseidon-testnet.json) */
export const TESTNET_POSEIDON_POOL =
  "0xA488809a089F003A2B6E69daa65B0db79823c93B" as const satisfies Address;

export const TESTNET_POSEIDON_DEPLOY_BLOCK = 90_260_331n;

/** Env override, else hard-coded testnet Poseidon pool */
export const POSEIDON_POOL: Address | null = (() => {
  const e = process.env.NEXT_PUBLIC_POSEIDON_SHIELD_POOL;
  if (e && e.startsWith("0x") && e.length === 42) return e as Address;
  if (PRODUCT_CHAIN_ID === 46630) return TESTNET_POSEIDON_POOL;
  return null;
})();

/**
 * Which pool the product uses.
 * Default poseidon on RH testnet; set NEXT_PUBLIC_HASH_SCHEME=keccak for legacy.
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
