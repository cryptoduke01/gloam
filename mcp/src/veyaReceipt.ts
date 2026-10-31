/**
 * The receipt of a payment VEYA allowed (optional, off unless
 * GLOAM_VEYA_ANCHOR_URL is set).
 *
 * VEYA's allow carries a check id. Once the payment lands, this proves it with
 * the receipt circuit, with that id as the proof's verifier, hashes the proof
 * into one bytes32 leaf, and sends VEYA the leaf to write to storeCommitment.
 * VEYA gets the leaf and the agent id, nothing else.
 *
 * The money has already moved when this runs, so it never throws and nothing it
 * does changes the payment. Its state lives on the payment's note in the note
 * store, saved before each step that can fail, so a failed receipt or anchor can
 * be retried. That state holds the full record, which shows the asset, the
 * minimum amount and the transaction hash: only the leaf and a status leave here.
 */
import { buildPaymentReceipt, cleanReceiptLabel, proofContext, type PaymentReceiptPlan, type ReceiptProver, type syncTree } from "@gloamtrade/sdk";
import type { Hex } from "viem";
import { guardTimeoutMs } from "./guardCall.js";
import type { McpNetwork } from "./networks.js";
import type { NoteReceipt, NoteStore, StoredNote } from "./noteStore.js";
import { anchorLeaf } from "./veyaGuard.js";

type Env = Record<string, string | undefined>;

/** The SDK's default for a receipt. Gloam's /verify reads a receipt as expired after it; the leaf stays on chain. */
const RECEIPT_TTL_S = 30 * 24 * 3600;
/** How long a payment's answer waits on its receipt. A slow one must not read as a payment that never came back. */
const RECEIPT_TIMEOUT_MS = 30_000;
/** An RPC can trail the receipt it just gave, so a tree that lacks the payment is read again before giving up. */
const SYNC_TRIES = 3;
const SYNC_WAIT_MS = 1_500;

export interface ReceiptContext {
  net: McpNetwork;
  client: Parameters<typeof syncTree>[0];
  syncTree: typeof syncTree;
  prover(): Promise<ReceiptProver>;
  notes: NoteStore;
  env: Env;
}

/** What the agent sees of a receipt: never the record. */
export interface ReceiptOutcome {
  status: "anchored" | "anchor_failed" | "receipt_failed";
  /** The payment's note handle, for gloam_retry_veya_receipts. */
  note: string;
  checkId: string;
  leaf: Hex | null;
  /** One line for the agent: a failure here says the payment still went through. */
  message: string;
}

const PAID = "Paid, and the money has moved, so do not pay again.";
const RETRY = "Call gloam_retry_veya_receipts to try again.";

/** What goes on the payment's note before it is sent, so a payment that lands with no answer can still get its receipt. */
export const plannedReceipt = (check: { checkId: string; agentId: string }): NoteReceipt => ({
  ...check,
  expiresAt: Math.floor(Date.now() / 1000) + RECEIPT_TTL_S,
  status: "pending",
});

function receiptPlan(note: StoredNote, receipt: NoteReceipt): PaymentReceiptPlan {
  const verifier = cleanReceiptLabel(receipt.checkId);
  return {
    chainId: note.chainId,
    pool: note.pool,
    asset: note.asset,
    paymentNote: { secret: note.secret, commitment: note.commitment, nullifier: note.nullifier, amountWei: note.amountWei, asset: note.asset },
    reveal: false,
    minAmountWei: BigInt(note.amountWei),
    verifier,
    expiresAt: receipt.expiresAt,
    context: proofContext({ kind: "payment", chainId: note.chainId, pool: note.pool, verifier, expiresAt: receipt.expiresAt }),
  };
}

/** The payment's path, from a tree read now: the one it was paid from was read before the payment existed. */
async function pathAfterLanding(note: StoredNote, ctx: ReceiptContext) {
  for (let tries = 0; tries < SYNC_TRIES; tries++) {
    if (tries) await new Promise((r) => setTimeout(r, SYNC_WAIT_MS));
    const tree = await ctx.syncTree(ctx.client, { pool: note.pool, fromBlock: ctx.net.deployBlock });
    const path = await tree.pathForCommitment(note.commitment);
    if (path) return path;
  }
  return null;
}

/**
 * Build the receipt if it is not built yet, then send VEYA its leaf if it has not
 * taken it. A built record is never rebuilt: a new root would make a new leaf for
 * the same payment. `note.createdTx` is the transaction that landed. Never throws.
 */
export async function settleReceipt(note: StoredNote & { receipt: NoteReceipt }, ctx: ReceiptContext): Promise<ReceiptOutcome> {
  let receipt = note.receipt;
  let kept = true;
  const keep = (patch: Partial<NoteReceipt>) => {
    receipt = { ...receipt, ...patch };
    try {
      ctx.notes.update(note.handle, { receipt });
    } catch {
      kept = false;
    }
  };
  const outcome = (status: ReceiptOutcome["status"], message: string): ReceiptOutcome => ({
    status,
    note: note.handle,
    checkId: receipt.checkId,
    leaf: receipt.leaf ?? null,
    message: kept ? message : `${message} The receipt could not be saved in the note store, so it may not be possible to retry it.`,
  });

  if (receipt.status === "anchored") return outcome("anchored", "VEYA already took this receipt's leaf.");
  if (!receipt.record) {
    const failed = (why: string) => {
      keep({ status: "receipt_failed" });
      return outcome("receipt_failed", `${PAID} ${why} Nothing went to VEYA. ${RETRY}`);
    };
    if (!note.createdTx) return failed("The payment's transaction is not known yet.");
    try {
      const path = await pathAfterLanding(note, ctx);
      if (!path) return failed("The payment does not show in the vault's tree yet, so its receipt could not be built.");
      const record = await buildPaymentReceipt({ plan: receiptPlan(note, receipt), path, txHash: note.createdTx, prove: await ctx.prover() });
      // Saved before it goes out, so a crash here leaves a leaf to send again, not a second one.
      keep({ status: "anchor_failed", record, leaf: record.leaf });
    } catch {
      return failed("The receipt could not be built.");
    }
  }

  const sent = await anchorLeaf(receipt.leaf!, receipt.agentId, ctx.env);
  if (!sent.anchored) {
    keep({ status: "anchor_failed" });
    return outcome("anchor_failed", `${PAID} The receipt is built and kept, but VEYA did not take its leaf: ${sent.why}. ${RETRY}`);
  }
  keep({ status: "anchored" });
  return outcome("anchored", "Paid, and VEYA took the receipt's leaf.");
}

/** The leaf the note store holds for a payment, if the receipt got that far. */
function keptLeaf(handle: string, ctx: ReceiptContext): Hex | null {
  try {
    return ctx.notes.get(handle)?.receipt?.leaf ?? null;
  } catch {
    return null;
  }
}

/** settleReceipt, but the caller stops waiting at the deadline. The work may still finish; a retry shows where it stands. */
export async function settleReceiptInTime(note: StoredNote & { receipt: NoteReceipt }, ctx: ReceiptContext): Promise<ReceiptOutcome> {
  const ms = guardTimeoutMs(ctx.env.GLOAM_VEYA_RECEIPT_TIMEOUT_MS, RECEIPT_TIMEOUT_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ReceiptOutcome>((resolve) => {
    timer = setTimeout(() => {
      const leaf = keptLeaf(note.handle, ctx);
      resolve({
        status: leaf ? "anchor_failed" : "receipt_failed",
        note: note.handle,
        checkId: note.receipt.checkId,
        leaf,
        message: `${PAID} ${leaf ? "The receipt is built and kept, but VEYA has not taken its leaf yet" : "The receipt is not built yet"} after ${ms / 1000}s, and that may still finish. ${RETRY}`,
      });
    }, ms);
  });
  try {
    return await Promise.race([settleReceipt(note, ctx), late]);
  } finally {
    clearTimeout(timer);
  }
}
