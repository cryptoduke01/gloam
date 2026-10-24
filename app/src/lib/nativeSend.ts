/**
 * Max for a public send of the chain's native coin (ETH on Robinhood Chain).
 *
 * A transfer of the whole balance can never be sent: the wallet needs value
 * plus gas times the fee per gas up front. So Max sets the network fee aside
 * from the raw balance (never from a rounded, locale-formatted display), and
 * returns the gas and fee it set aside, so the send can ask the wallet for
 * exactly those and the two always fit in the balance.
 */
import type { Address, PublicClient } from "viem";

export type NativeFees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | { gasPrice: bigint };

export type MaxNativeSend = {
  /** What to send. */
  value: bigint;
  /** Gas limit set aside for it. */
  gas: bigint;
  /** Fee per gas set aside for it. */
  fees: NativeFees;
};

/** Gas estimates get a quarter on top: a receiving contract or a busier block can use a little more. */
const GAS_HEADROOM_PCT = 125n;

/** Max is floored to 6 decimals of ETH, so the field reads 0.123456, not 18 digits. */
const MAX_STEP = 10n ** 12n;

/**
 * The most a transfer can carry from `balance` once `gas` at `feePerGas` is
 * set aside, floored to 6 decimals. Null when the fee alone takes it all.
 */
export function maxAfterFee(balance: bigint, gas: bigint, feePerGas: bigint): bigint | null {
  const left = balance - gas * feePerGas;
  const value = left > 0n ? (left / MAX_STEP) * MAX_STEP : 0n;
  return value > 0n ? value : null;
}

function withHeadroom(gas: bigint): bigint {
  return (gas * GAS_HEADROOM_PCT + 99n) / 100n;
}

export type MaxSendClient = Pick<PublicClient, "getBalance" | "estimateGas" | "estimateFeesPerGas" | "getGasPrice">;

/** EIP-1559 fees where the chain has them, else a legacy gas price. */
async function feesNow(client: MaxSendClient): Promise<NativeFees> {
  try {
    const f = await client.estimateFeesPerGas();
    if (f.maxFeePerGas && f.maxPriorityFeePerGas != null) {
      return { maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas };
    }
  } catch {
    /* no EIP-1559 fees on this chain: a legacy price below */
  }
  return { gasPrice: await client.getGasPrice() };
}

/**
 * Max from `from` to `to`, read from the chain now. The gas is estimated for
 * the real transfer (to that address, of that amount) and checked again for
 * the amount Max lands on, since a contract can need more gas for more value.
 * Throws a plain message when the fee takes the whole balance or cannot be read.
 */
export async function estimateMaxNativeSend(client: MaxSendClient, from: Address, to: Address): Promise<MaxNativeSend> {
  const [balance, fees] = await Promise.all([client.getBalance({ address: from }), feesNow(client)]);
  const perGas = "gasPrice" in fees ? fees.gasPrice : fees.maxFeePerGas;
  if (perGas <= 0n) throw new Error("Could not read the network fee. Try again.");
  // 1 wei first: an estimate for the whole balance fails, since it leaves nothing for the fee
  let gas = withHeadroom(await client.estimateGas({ account: from, to, value: 1n }));
  for (let check = 0; check < 3; check++) {
    if (gas <= 0n) break;
    const value = maxAfterFee(balance, gas, perGas);
    if (value === null) throw new Error("Not enough ETH to cover the network fee.");
    const needed = await client.estimateGas({ account: from, to, value });
    if (needed <= gas) return { value, gas, fees };
    gas = withHeadroom(needed);
  }
  throw new Error("Could not settle on a network fee for Max. Try again, or type an amount.");
}
