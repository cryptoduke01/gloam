/**
 * The smallest private swap on a chain where gas is dear. The relay pays a swap's
 * gas, about 1.7M on Ethereum, and the vault's cash-out fee is all that surely comes
 * back. The price buffer doesn't count: on a public mempool anyone can trade in front
 * of a swap and take it. So a swap has to bring in, as vault fee, at least the gas it
 * costs, and the floor moves with the gas price. Nothing is charged for this: below the
 * floor the swap simply isn't sent. A refund and an exit never face it.
 *
 * Shared by the relay and the app: no server-only imports here.
 */
import type { Address } from "viem";

/** Chainlink's ETH / USD feed, on the chains that have a floor. Checked on chain 2026-11-02: description() "ETH / USD", 8 decimals. */
export const ETH_USD_FEED: Readonly<Record<number, Address>> = {
  1: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

export const ethUsdFeedAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** The feed updates at least hourly. Older than this, the relay won't price a swap with it. */
export const FEED_MAX_AGE_SEC = 2 * 3600;

/** Whether a swap on this chain has to pay for its own gas. */
export function hasSwapFloor(chainId: number): boolean {
  return ETH_USD_FEED[chainId] !== undefined;
}

/**
 * Gas one swap costs the relay: the most seen for its hops on a fork of Ethereum, with real
 * proofs against the live vault (scripts/fork-router-v3.mts).
 */
const SWAP_GAS_FIRST_HOP = 1_700_000n;
const SWAP_GAS_NEXT_HOP = 130_000n;

export function swapGasUnits(hops: number): bigint {
  return SWAP_GAS_FIRST_HOP + SWAP_GAS_NEXT_HOP * BigInt(Math.max(0, hops - 1));
}

/** The smallest swap, in dollars, whose vault fee covers its gas. Infinity while the vault takes no fee. */
export function smallestSwapUsd(p: { gasPriceWei: bigint; ethUsd: number; feeBps: number; hops: number }): number {
  if (p.feeBps <= 0) return Number.POSITIVE_INFINITY;
  const gasUsd = (Number(swapGasUnits(p.hops) * p.gasPriceWei) / 1e18) * p.ethUsd;
  return (gasUsd * 10_000) / p.feeBps;
}

/** The app asks a little above the relay's floor, so gas that moves a few percent while a swap is proved doesn't turn it away. */
export function swapFloorShown(usd: number): number {
  return usd * 1.1;
}

/** One line in the app's words. */
export function swapFloorMessage(label: string, usd: number): string {
  return `A swap on ${label} has to be worth about $${Math.ceil(usd).toLocaleString("en-US")} right now, to cover its gas. Swap a larger amount, or wait for gas to fall.`;
}
