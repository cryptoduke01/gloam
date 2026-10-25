/**
 * Mainnet pools: the one place their addresses live in the SDK.
 *
 * MAINNET_POOLS is FILLED IN ON DEPLOY DAY: paste each pool address and the
 * block its deploy transaction landed in (the deploy script prints both), the
 * same values as MAINNET_POOLS in the app (app/src/lib/mainnet.ts). Until a
 * chain has both, that mainnet does not exist for the SDK: mainnetNetwork()
 * returns null, gloamNetworks() leaves it out, and the builders refuse its
 * chain id instead of guessing a pool.
 *
 * Base Sepolia (BASE_SEPOLIA_POOL) is Base's testnet. It runs
 * the mainnet pool on the mainnet keys with test funds, so its address is kept
 * here too and is filled in the same way after its deploy.
 *
 * Everything else about mainnet (chains, assets, limits, keys) is derived in
 * constants.ts from these entries.
 */
import type { Address } from "viem";

export type MainnetChainId = 4663 | 4217 | 8453;

export interface MainnetPoolInput {
  /** ShieldPoolPayments address, or null until it is deployed. */
  pool: Address | null;
  /** Block the pool's deploy transaction landed in, or null until it is deployed. */
  deployBlock: bigint | null;
}

export const MAINNET_POOLS: Record<MainnetChainId, MainnetPoolInput> = {
  // Robinhood Chain mainnet (4663): USDG + GLOAM. Deployed 21 Oct 2026.
  4663: { pool: "0x39e28cde55cab798874746ac52cb4b5cc99a0194", deployBlock: 94_194_599n },
  // Tempo mainnet (4217): USDC.e, pathUSD, USDT0, OUSD. Deployed 21 Oct 2026.
  4217: { pool: "0x39e28cde55cab798874746ac52cb4b5cc99a0194", deployBlock: 45_172_561n },
  // Base mainnet (8453): USDC, EURC, USDT, ETH. Not deployed yet; follows Base Sepolia.
  8453: { pool: null, deployBlock: null },
};

/**
 * Base Sepolia (84532): ShieldPoolPayments on the ceremony's final keys, with
 * test funds. Filled in after its deploy, like MAINNET_POOLS: without both
 * values Base Sepolia does not exist for the SDK. Deployed 24 Oct 2026.
 */
export const BASE_SEPOLIA_POOL: MainnetPoolInput = { pool: "0x39e28cde55cab798874746ac52cb4b5cc99a0194", deployBlock: 49_802_958n };

function checkedPool(entry: MainnetPoolInput, name: string): { pool: Address; deployBlock: bigint } | null {
  const { pool, deployBlock } = entry;
  if (pool === null || deployBlock === null) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool) || /^0x0{40}$/.test(pool)) {
    throw new Error(`${name}.pool is not a pool address: ${pool}`);
  }
  if (deployBlock <= 0n) {
    throw new Error(`${name}.deployBlock must be the deploy block, got ${deployBlock}`);
  }
  return { pool, deployBlock };
}

/**
 * A chain's mainnet pool, or null while it is not filled in. A value that is
 * not a real address or deploy block throws, so a typo fails loudly instead of
 * pointing money at the wrong contract.
 */
export function mainnetPoolFor(chainId: MainnetChainId): { pool: Address; deployBlock: bigint } | null {
  return checkedPool(MAINNET_POOLS[chainId], `MAINNET_POOLS[${chainId}]`);
}

/** The Base Sepolia pool, or null while BASE_SEPOLIA_POOL is not filled in. Checked like mainnetPoolFor. */
export function baseSepoliaPool(): { pool: Address; deployBlock: bigint } | null {
  return checkedPool(BASE_SEPOLIA_POOL, "BASE_SEPOLIA_POOL");
}
