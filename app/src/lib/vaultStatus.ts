/**
 * Vault readiness without depending on the user's wallet network.
 */

import { zeroAddress, type Address } from "viem";
import {
  TESTNET_POSEIDON_POOL,
  LEGACY_POSEIDON_POOL,
} from "./config";
import { getRhPublicClient } from "./rhClient";
import { SHIELD_POOL_ADDRESS, shieldPoolAbi } from "./shield";

/** Known sealed-swap verifier on RH testnet Poseidon vault (poseidon-testnet.json) */
export const KNOWN_SEALED_SWAP_VERIFIER =
  "0x68C28ECD40320038bF8DE34Bb02064e12f602371" as const satisfies Address;

export type VaultReadiness =
  | { status: "ready"; verifier: Address; pool: Address }
  | { status: "no_verifier"; pool: Address }
  | { status: "offline"; pool: Address | null; reason: string };

export async function readVaultSealedReadiness(): Promise<VaultReadiness> {
  const pool = SHIELD_POOL_ADDRESS;
  if (!pool) {
    return { status: "offline", pool: null, reason: "No vault address in app config." };
  }

  // Known sealed vault: prefer live read, fall back to known verifier
  const isKnownSealed =
    pool.toLowerCase() === TESTNET_POSEIDON_POOL.toLowerCase();

  try {
    const client = getRhPublicClient();
    const v = (await client.readContract({
      address: pool,
      abi: shieldPoolAbi,
      functionName: "sealedSwapVerifier",
    })) as Address;

    if (!v || v === zeroAddress) {
      if (isKnownSealed) {
        // Deploy record says verifier is set; treat as ready if env is stale
        return {
          status: "ready",
          verifier: KNOWN_SEALED_SWAP_VERIFIER,
          pool,
        };
      }
      return { status: "no_verifier", pool };
    }
    return { status: "ready", verifier: v, pool };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "RPC error";
    // Known sealed pool + transient RPC: still allow private trade UI
    if (isKnownSealed) {
      return {
        status: "ready",
        verifier: KNOWN_SEALED_SWAP_VERIFIER,
        pool,
      };
    }
    if (pool.toLowerCase() === LEGACY_POSEIDON_POOL.toLowerCase()) {
      return {
        status: "offline",
        pool,
        reason: "This build points at the pre-sealed vault. Need the sealed pool.",
      };
    }
    return { status: "offline", pool, reason: msg.slice(0, 120) };
  }
}

export async function readPoolDeposited(asset: Address): Promise<bigint | null> {
  const pool = SHIELD_POOL_ADDRESS;
  if (!pool) return null;
  try {
    const client = getRhPublicClient();
    return (await client.readContract({
      address: pool,
      abi: shieldPoolAbi,
      functionName: "deposited",
      args: [asset],
    })) as bigint;
  } catch {
    return null;
  }
}
