/**
 * $GLOAM Transfer logs over a block range, for the balance replays (the
 * snapshot script, and the final count of a close-weighted vote). Works with
 * any EIP-1193 style `request`, so the scripts and the server share it.
 */
import { GLOAM_TOKEN_ADDRESS, TRANSFER_TOPIC, type TransferLog } from "./core";

type Request = (args: { method: "eth_getLogs"; params: unknown[] }) => Promise<unknown>;

/** The widest range asked for at once; the RPC narrows it further when it has to. */
export const LOG_SPAN = 9_000_000;

/** Transfer logs in [from, to], halving the range whenever the RPC says it is too much. */
export async function transferLogs(request: Request, from: number, to: number): Promise<TransferLog[]> {
  if (to < from) return [];
  try {
    return (await request({
      method: "eth_getLogs",
      params: [{ address: GLOAM_TOKEN_ADDRESS, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER_TOPIC] }],
    })) as TransferLog[];
  } catch (e) {
    const text = String((e as Error)?.message ?? e);
    if (from === to || !/limit|narrow|range|too many|exceed/i.test(text)) throw e;
    const mid = Math.floor((from + to) / 2);
    return [...(await transferLogs(request, from, mid)), ...(await transferLogs(request, mid + 1, to))];
  }
}

/** Every Transfer log in [from, to], asked for in spans of LOG_SPAN blocks. */
export async function allTransferLogs(request: Request, from: number, to: number): Promise<TransferLog[]> {
  const logs: TransferLog[] = [];
  for (let start = from; start <= to; start += LOG_SPAN) logs.push(...(await transferLogs(request, start, Math.min(to, start + LOG_SPAN - 1))));
  return logs;
}
