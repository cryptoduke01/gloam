/**
 * The leaf VEYA anchors for one Gloam payment: a receipt hashes into one bytes32
 * (paymentReceiptLeaf in @gloamtrade/sdk), and that bytes32 goes to Veya.sol's
 * storeCommitment. The amount and the payee are not in the leaf.
 *
 *   # dry run on a sample record: no keys, no network, nothing sent
 *   npx tsx examples/veya-receipt/veya-receipt.ts
 *
 *   # a record of your own, from buildPaymentReceipt (see examples/san-verano)
 *   VEYA_ENVIRONMENT_UUID=0x... npx tsx examples/veya-receipt/veya-receipt.ts record.json
 *
 * This script takes no key and never sends. To anchor for real, pass EvmAnchor
 * from @veyanet/sdk to anchorReceipt on your own machine, with a throwaway
 * wallet that holds only gas. The README has the lines.
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bytesToHex, encodeFunctionData, hexToBytes, type Hex } from "viem";
import { RH_MAINNET_CHAIN_ID, RH_MAINNET_USDG, mainnetNetwork, paymentReceiptLeaf, verifyPaymentReceiptLeaf, type ReceiptLeafFields } from "@gloamtrade/sdk";

/** The one call of Veya.sol's this needs. */
const STORE_COMMITMENT_ABI = [
  {
    type: "function",
    name: "storeCommitment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "environmentUuid", type: "bytes16" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** All this example asks of VEYA's client. EvmAnchor in @veyanet/sdk has this method, with these arguments. */
export interface CommitmentStore {
  storeCommitment(environmentUuid: Uint8Array, commitment: Uint8Array): Promise<string>;
}

/** Hash a receipt into its leaf and hand the bytes32 to storeCommitment. */
export async function anchorReceipt(store: CommitmentStore, environmentUuid: Hex, record: ReceiptLeafFields): Promise<{ leaf: Hex; tx: string }> {
  if (!/^0x[0-9a-fA-F]{32}$/.test(environmentUuid)) throw new Error("An environment uuid is 16 bytes of hex (bytes16).");
  const leaf = paymentReceiptLeaf(record);
  const tx = await store.storeCommitment(hexToBytes(environmentUuid), hexToBytes(leaf));
  return { leaf, tx };
}

/** Stands in for EvmAnchor: shows the call that would go out, and sends nothing. */
export const dryRunStore: CommitmentStore = {
  async storeCommitment(environmentUuid, commitment) {
    const args = [bytesToHex(environmentUuid), bytesToHex(commitment)] as const;
    console.log(`storeCommitment(${args.join(", ")})`);
    console.log(`calldata ${encodeFunctionData({ abi: STORE_COMMITMENT_ABI, functionName: "storeCommitment", args })}`);
    return "dry run: nothing sent";
  },
};

/** Not a real payment: the shape of a receipt's leaf fields, so the dry run has something to hash. */
const SAMPLE: ReceiptLeafFields = {
  chainId: RH_MAINNET_CHAIN_ID,
  pool: mainnetNetwork("robinhood")!.pool,
  txHash: `0x${"ab".repeat(32)}`,
  // root, commitment, asset, minAmount, reveal, shownAmount, context
  publicSignals: ["1", "2", BigInt(RH_MAINNET_USDG).toString(), "1000000", "0", "0", "3"],
};

async function main() {
  const path = process.argv[2];
  let record = SAMPLE;
  if (path) {
    const read = JSON.parse(readFileSync(path, "utf8")) as ReceiptLeafFields & { leaf?: string };
    // A record says what its leaf is. One that does not recompute is not worth anchoring.
    if (read.leaf && !verifyPaymentReceiptLeaf(read.leaf, read)) throw new Error(`The leaf in ${path} does not match its record.`);
    record = read;
  }
  const environmentUuid = (process.env.VEYA_ENVIRONMENT_UUID?.trim() || `0x${"00".repeat(16)}`) as Hex;
  console.log(path ? `Record: ${path}` : "A sample record, not a real payment.");
  const { leaf, tx } = await anchorReceipt(dryRunStore, environmentUuid, record);
  console.log(`leaf ${leaf}`);
  console.log(tx);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
