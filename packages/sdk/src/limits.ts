/**
 * Beta deposit limits, read live from the vault.
 *
 * Each payments vault caps one deposit (perDeposit) and the running total of
 * each asset (total) while depositLimitsOn is true. The owner changes them
 * through the vault's timelock, so a limit built into this package goes stale
 * the day a change lands. This reads them from the vault instead:
 * depositLimitsOn(), depositLimit(asset) and deposited(asset).
 *
 * When the read fails (an RPC down, a reader on the wrong chain), nothing is
 * refused here: the vault enforces its own limits, and a deposit over one
 * reverts on chain with nothing lost but gas.
 */
import { formatUnits, type Address, type PublicClient } from "viem";
import { NATIVE_ASSET, networkForChainId, networkName } from "./constants.js";

/** The vault reads a live limit check needs. */
export const POOL_DEPOSIT_LIMIT_ABI = [
  { type: "function", name: "depositLimitsOn", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "depositLimit",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "perDeposit", type: "uint128" },
      { name: "total", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "deposited",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** One asset's live limits on a vault. */
export interface LiveDepositLimit {
  /** False when the vault has its limits off: any amount goes. */
  on: boolean;
  /** Most one deposit can be, in base units. 0 with limits on: the vault takes none of this asset. */
  perDeposit: bigint;
  /** Most the vault holds of this asset in deposits, in base units. */
  total: bigint;
  /** What the vault holds of this asset in deposits now. */
  deposited: bigint;
  /** Room left under `total` now. */
  room: bigint;
}

/** The reads readDepositLimit makes; a viem PublicClient fits. */
export type DepositLimitReader = Pick<PublicClient, "readContract">;

/**
 * The live limits for `asset` on the vault at `pool`. Throws when the vault
 * can't be read, so a caller can tell "no limit" apart from "unknown".
 */
export async function readDepositLimit(client: DepositLimitReader, pool: Address, asset: Address): Promise<LiveDepositLimit> {
  const [on, limit, deposited] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_DEPOSIT_LIMIT_ABI, functionName: "depositLimitsOn" }),
    client.readContract({ address: pool, abi: POOL_DEPOSIT_LIMIT_ABI, functionName: "depositLimit", args: [asset] }),
    client.readContract({ address: pool, abi: POOL_DEPOSIT_LIMIT_ABI, functionName: "deposited", args: [asset] }),
  ]);
  const [perDeposit, total] = limit as readonly [bigint, bigint];
  const held = deposited as bigint;
  return { on: Boolean(on), perDeposit, total, deposited: held, room: total > held ? total - held : 0n };
}

function amountText(v: bigint, decimals: number): string {
  const [whole = "0", frac] = formatUnits(v, decimals).split(".");
  return BigInt(whole).toLocaleString("en-US") + (frac ? `.${frac}` : "");
}

/**
 * Why the vault would refuse a deposit of `amount` of `asset` under `limit`,
 * or null when it would take it. `symbol` and `decimals` only shape the words.
 */
export function depositLimitProblem(
  limit: LiveDepositLimit,
  amount: bigint,
  where: string,
  symbol: string,
  decimals: number
): string | null {
  if (!limit.on) return null;
  if (limit.perDeposit === 0n) return `The ${where} vault takes no ${symbol} deposits.`;
  if (amount > limit.perDeposit) {
    return `Over the beta limit on ${where}: at most ${amountText(limit.perDeposit, decimals)} ${symbol} per deposit.`;
  }
  if (amount > limit.room) {
    return limit.room === 0n
      ? `The ${where} vault is full for ${symbol} during the beta. Try again once the limit is raised.`
      : `The ${where} vault has room for ${amountText(limit.room, decimals)} more ${symbol} during the beta.`;
  }
  return null;
}

/**
 * Checks a deposit against the vault's live limits before any proof is made
 * (assertDepositAllowed covers what does not change: native deposits and the
 * listed assets). Throws with plain words when the vault would refuse it.
 * When the vault can't be read, it does not throw: the vault enforces its own
 * limits. Unknown chains are skipped unless `pool` is passed.
 * Returns the limit read, or null when none was.
 */
export async function assertDepositWithinLiveLimit(
  client: DepositLimitReader,
  chainId: number,
  asset: Address,
  amount: bigint,
  pool?: Address
): Promise<LiveDepositLimit | null> {
  const net = networkForChainId(chainId);
  const at = pool ?? net?.pool;
  if (!at) return null;
  let limit: LiveDepositLimit;
  try {
    limit = await readDepositLimit(client, at, asset);
  } catch {
    return null;
  }
  const listed = net?.assets.find((a) => a.address.toLowerCase() === asset.toLowerCase());
  const symbol = listed?.symbol ?? (asset.toLowerCase() === NATIVE_ASSET.toLowerCase() ? "ETH" : asset);
  const problem = depositLimitProblem(limit, amount, networkName(chainId), symbol, listed?.decimals ?? 18);
  if (problem) throw new Error(problem);
  return limit;
}
