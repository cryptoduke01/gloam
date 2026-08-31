/**
 * On-chain payment memos (GloamPayMemo), Zcash/Solana-style discovery.
 * After vault transfer, sender posts encrypted ticket; recipient scans logs.
 */

import type { Address, Hex, PublicClient } from "viem";
import { PRODUCT_CHAIN_ID } from "./chain";

/** Live RH testnet deploy (see contracts/deployments/poseidon-testnet.json) */
export const TESTNET_PAY_MEMO =
  "0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE" as const satisfies Address;

/** Env override, else hard-coded testnet memo board */
export const PAY_MEMO_ADDRESS: Address | null = (() => {
  const e = process.env.NEXT_PUBLIC_PAY_MEMO;
  if (e && e.startsWith("0x") && e.length === 42) return e as Address;
  if (PRODUCT_CHAIN_ID === 46630) return TESTNET_PAY_MEMO;
  return null;
})();

export const payMemoAbi = [
  {
    type: "function",
    name: "postMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentCommitment", type: "bytes32" },
      { name: "memo", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "PaymentMemo",
    inputs: [
      { name: "paymentCommitment", type: "bytes32", indexed: true },
      { name: "poster", type: "address", indexed: true },
      { name: "memo", type: "bytes", indexed: false },
    ],
  },
] as const;

export function isPayMemoLive(): boolean {
  return Boolean(PAY_MEMO_ADDRESS);
}

/** Encode ticket string as hex bytes for postMemo */
export function ticketToMemoBytes(ticket: string): Hex {
  const enc = new TextEncoder().encode(ticket);
  let hex = "0x";
  for (const b of enc) hex += b.toString(16).padStart(2, "0");
  return hex as Hex;
}

export function memoBytesToTicket(data: Hex): string {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export type ScannedMemo = {
  paymentCommitment: Hex;
  poster: Address;
  ticket: string;
  txHash?: Hex;
  blockNumber?: bigint;
};

/**
 * Scan recent PaymentMemo logs (chunked). Caller tries decrypt with receive tag.
 */
export async function fetchPaymentMemos(
  client: PublicClient,
  fromBlock: bigint,
  toBlock?: bigint
): Promise<ScannedMemo[]> {
  if (!PAY_MEMO_ADDRESS) return [];
  const latest = toBlock ?? (await client.getBlockNumber());
  if (latest < fromBlock) return [];
  const CHUNK = 40_000n;
  const out: ScannedMemo[] = [];
  for (let start = fromBlock; start <= latest; start += CHUNK) {
    let end = start + CHUNK - 1n;
    if (end > latest) end = latest;
    const logs = await client.getLogs({
      address: PAY_MEMO_ADDRESS,
      event: {
        type: "event",
        name: "PaymentMemo",
        inputs: [
          { name: "paymentCommitment", type: "bytes32", indexed: true },
          { name: "poster", type: "address", indexed: true },
          { name: "memo", type: "bytes", indexed: false },
        ],
      },
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      const args = log.args as {
        paymentCommitment?: Hex;
        poster?: Address;
        memo?: Hex;
      };
      if (!args.paymentCommitment || !args.memo) continue;
      try {
        out.push({
          paymentCommitment: args.paymentCommitment,
          poster: (args.poster ??
            "0x0000000000000000000000000000000000000000") as Address,
          ticket: memoBytesToTicket(args.memo),
          txHash: log.transactionHash as Hex | undefined,
          blockNumber: log.blockNumber ?? undefined,
        });
      } catch {
        /* skip */
      }
    }
  }
  return out.reverse(); // newest first
}

export const PAY_MEMO_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_PAY_MEMO_DEPLOY_BLOCK ?? "90421567"
);

export const MEMO_GAS_LIMIT = 200_000n;
