/**
 * Product config: keccak Phase-1 pool vs Poseidon Phase-2 pool.
 * Default product path = sealed Poseidon vault on RH testnet.
 *
 * Stale Vercel envs that still point at pre-sealed pool 0xA488… are ignored —
 * that vault has no sealedSwap and breaks Private trade.
 */

import type { Address } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";

export type HashScheme = "keccak" | "poseidon";

/** Legacy Phase-1 pool (no sealed swap) */
export const KECCAK_POOL =
  "0x2BD98196D90AB45D58843B4c8B8809aa34343d35" as const satisfies Address;

/** Phase-2 Poseidon pool — live RH testnet with sealedSwap */
export const TESTNET_POSEIDON_POOL =
  "0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F" as const satisfies Address;

export const TESTNET_POSEIDON_DEPLOY_BLOCK = 90_436_718n;

/** Prior Poseidon pool (pre-sealedSwap) — history only, never product default */
export const LEGACY_POSEIDON_POOL =
  "0xA488809a089F003A2B6E69daa65B0db79823c93B" as const satisfies Address;

export const LEGACY_POSEIDON_DEPLOY_BLOCK = 90_260_331n;

function isAddressLike(e: string | undefined): e is Address {
  return Boolean(e && e.startsWith("0x") && e.length === 42);
}

function sameAddr(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Resolve Poseidon product pool.
 * Env may override, but never use the pre-sealed A488 vault for the live app.
 */
export const POSEIDON_POOL: Address | null = (() => {
  const e = process.env.NEXT_PUBLIC_POSEIDON_SHIELD_POOL;
  if (isAddressLike(e)) {
    if (sameAddr(e, LEGACY_POSEIDON_POOL)) {
      // Stale Vercel env from before sealed redeploy
      return TESTNET_POSEIDON_POOL;
    }
    return e;
  }
  if (PRODUCT_CHAIN_ID === 46630) return TESTNET_POSEIDON_POOL;
  return null;
})();

/**
 * Which pool the product uses.
 * Default poseidon on RH testnet; set NEXT_PUBLIC_HASH_SCHEME=keccak only for legacy.
 */
export function activeHashScheme(): HashScheme {
  const forced = process.env.NEXT_PUBLIC_HASH_SCHEME as HashScheme | undefined;
  if (forced === "keccak") return "keccak";
  if (forced === "poseidon") return "poseidon";
  if (POSEIDON_POOL) return "poseidon";
  return "keccak";
}

export function activePoolAddress(): Address | null {
  if (activeHashScheme() === "poseidon" && POSEIDON_POOL) {
    return POSEIDON_POOL;
  }
  if (PRODUCT_CHAIN_ID === 46630) {
    const e = process.env.NEXT_PUBLIC_SHIELD_POOL_ADDRESS;
    if (isAddressLike(e)) {
      // Don't silently land on pre-sealed poseidon via wrong env either
      if (sameAddr(e, LEGACY_POSEIDON_POOL)) return TESTNET_POSEIDON_POOL;
      return e;
    }
    return KECCAK_POOL;
  }
  return null;
}

/** Deploy block for getLogs / tree rebuild for the active product pool */
export function activeShieldDeployBlock(): bigint {
  const raw = process.env.NEXT_PUBLIC_SHIELD_DEPLOY_BLOCK?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = BigInt(raw);
    // Stale env from pre-sealed vault must not scan the wrong history for 0x4F38
    if (
      POSEIDON_POOL &&
      sameAddr(POSEIDON_POOL, TESTNET_POSEIDON_POOL) &&
      n === LEGACY_POSEIDON_DEPLOY_BLOCK
    ) {
      return TESTNET_POSEIDON_DEPLOY_BLOCK;
    }
    return n;
  }
  if (activeHashScheme() === "poseidon") return TESTNET_POSEIDON_DEPLOY_BLOCK;
  return 90_232_912n;
}

export const UNSHIELD_ENABLED =
  process.env.NEXT_PUBLIC_UNSHIELD_ENABLED === "true" ||
  activeHashScheme() === "poseidon";
