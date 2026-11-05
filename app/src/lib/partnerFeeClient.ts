"use client";

/**
 * Pays a partner's interface fee (lib/partnerFeeMath) before the payment or cash
 * out it goes with: one private transfer from the user's note, the fee to the
 * partner's Gloam address and the rest back to the user as a fresh note, sent
 * through the Gloam relay with { partnerFee }, so the relay counts it as charged
 * once it lands (lib/partnerFees). Then the partner's heads-up goes on the memo
 * board, sealed to their Gloam address, so their Gloam app finds the fee under
 * Receive. The main action then spends the fresh note.
 *
 * The rest is saved before anything is sent, out of the balance until the chain
 * shows it (sweepPending), and names the note it came from (sweptFrom), the same
 * rule as every split (lib/cashOutSplit): the money is never counted twice, and a
 * send that may have gone out settles on the next sync.
 */
import type { Address, Hex } from "viem";
import { buildTransferWitness } from "./proverTransfer";
import { fieldToBytes32, proveTransferInBrowser } from "./proveClient";
import type { PoseidonMerklePath } from "./merklePoseidon";
import { relayMemo, relayTransfer, waitForTx } from "./relay/client";
import { publicClientFor } from "./rhClient";
import type { GloamNetwork } from "./networks";
import { assertNoteOnNetwork, dropUnsentNote, formatAssetLabel, saveLocalNote, updateLocalNote, type LocalNote } from "./shield";
import { buildNotePackage, encodeNotePackage } from "./notePackage";
import { encryptTicketForTag, isValidReceiveTag } from "./receiveTag";
import { isPayMemoLive, ticketToMemoBytes } from "./payMemo";
import { freshPath, splitMaybeSent, splitNotes } from "./cashOutSplit";
import type { FeeKind } from "./partnerFeeMath";

export const FEE_MAYBE_SENT =
  "The partner fee may have gone out. Your money is safe in the vault and shows again once it lands. Then try again from there.";
export const FEE_REVERTED = "The partner fee didn't go through on this try. Your money is safe in the vault: refresh, then try again.";
export const FEE_NEEDS_RELAY = "This link's partner fee goes through the Gloam relay, which is off right now. Try again shortly.";

/** "Partner fee to Motion: 0.25 USDG". */
export function feeLine(name: string, amount: bigint, asset: Address | string): string {
  return `Partner fee to ${name}: ${formatAssetLabel(amount.toString(), asset)}`;
}

/** Why `note` can't cover `amount` and `fee` together, or null. */
export function coverProblem(note: Pick<LocalNote, "amountWei" | "asset">, amount: bigint, fee: bigint, name: string): string | null {
  if (fee <= 0n) return null;
  const total = BigInt(note.amountWei);
  if (amount + fee <= total) return null;
  return `This balance can't cover ${formatAssetLabel(amount.toString(), note.asset)} and the partner fee to ${name} (${formatAssetLabel(fee.toString(), note.asset)}). Pick a smaller amount or a larger balance.`;
}

export type PayFeeArgs = {
  note: LocalNote;
  path: PoseidonMerklePath;
  fee: bigint;
  /** The partner's Gloam address for fees on this network. */
  to: string;
  code: string;
  kind: FeeKind;
  owner: Address;
  net: GloamNetwork;
  relayAvailable: boolean;
  onStatus: (s: string) => void;
};

/**
 * Sends the fee and returns the rest as a landed note (with its leaf index),
 * ready for the payment or cash out. Throws a plain message when it can't.
 */
export async function payPartnerFee(args: PayFeeArgs): Promise<LocalNote> {
  const { note, fee, net } = args;
  if (!args.relayAvailable) throw new Error(FEE_NEEDS_RELAY);
  if (!isValidReceiveTag(args.to)) throw new Error("This link's partner fee address is not a Gloam address. Nothing was sent.");
  assertNoteOnNetwork(note, net);
  const total = BigInt(note.amountWei);
  if (fee <= 0n || fee >= total) throw new Error("This balance can't cover the partner fee.");

  args.onStatus("Proving the partner fee privately, this takes 10 to 30 seconds…");
  const w = await buildTransferWitness({ secretHex: note.secret, amountIn: total, amountPay: fee, asset: note.asset, path: args.path });
  if (w.blocker) throw new Error(w.blocker);
  const { proofBytes } = await proveTransferInBrowser(w.circomInput);
  const nullifier = fieldToBytes32(w.publicInputs.nullifier);
  const paymentCommitment = fieldToBytes32(w.publicInputs.newCommitment0);

  // the fee note, sealed to the partner's Gloam address: only they can open it
  const ticket = await encryptTicketForTag(
    encodeNotePackage(
      buildNotePackage({
        pool: note.pool,
        asset: w.paymentNote.asset,
        amountWei: w.paymentNote.amountWei,
        secret: w.paymentNote.secret,
        commitment: w.paymentNote.commitment,
        note: "Partner fee",
        chainId: note.chainId,
      })
    ),
    args.to
  );

  // the rest is the user's: kept before anything is sent, out of the balance until it lands
  const { change } = splitNotes(note, w, nullifier, args.owner, Date.now());
  if (!change) throw new Error("This balance can't cover the partner fee.");
  const rest: LocalNote = { ...change, id: `fee-chg-${Date.now()}` };
  await saveLocalNote({ ...rest, sweepPending: true });

  let hash: Hex;
  try {
    args.onStatus("Sending the partner fee through the Gloam relay…");
    hash = await relayTransfer({
      chainId: note.chainId,
      proof: proofBytes,
      root: fieldToBytes32(w.publicInputs.root),
      nullifier,
      commitments: [paymentCommitment, fieldToBytes32(w.publicInputs.newCommitment1)],
      partnerFee: { code: args.code, kind: args.kind, asset: note.asset as Address, amount: fee.toString() },
    });
  } catch (e) {
    if (splitMaybeSent(e, true)) throw new Error(FEE_MAYBE_SENT);
    dropUnsentNote(rest.id);
    throw e;
  }

  args.onStatus("Waiting for the partner fee to land…");
  let outcome: "success" | "reverted";
  try {
    outcome = await waitForTx(hash, undefined, publicClientFor(net));
  } catch {
    throw new Error(FEE_MAYBE_SENT);
  }
  if (outcome === "reverted") throw new Error(FEE_REVERTED);

  updateLocalNote(note.id, { status: "recovered", txHash: hash });
  const at = await freshPath(rest.commitment, net);
  updateLocalNote(rest.id, { sweepPending: false, txHash: hash, ...(at ? { leafIndex: at.leafIndex } : {}) });

  // the partner's heads-up: best effort, the fee has landed either way
  if (isPayMemoLive()) {
    void relayMemo({ chainId: note.chainId, paymentCommitment, memo: ticketToMemoBytes(ticket) }).catch(() => undefined);
  }
  if (!at) throw new Error("The partner fee is paid. Refresh, then send again from your balance.");
  return { ...rest, sweepPending: false, txHash: hash, leafIndex: at.leafIndex };
}
