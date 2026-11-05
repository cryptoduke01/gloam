"use client";

/**
 * Pays a partner's interface fee (lib/partnerFeeMath) before the payment or cash
 * out it goes with: one private transfer from the user's note, the fee to the
 * partner's Gloam address and the rest back to the user as a fresh note, sent
 * through the Gloam relay with { partnerFee }, so the relay counts it as charged
 * once it lands (lib/partnerFees). Then the partner's heads-up goes on the memo
 * board, sealed to their Gloam address, so their Gloam app finds the fee under
 * Receive; its sealed code is also kept under Sent links before anything is sent,
 * so a heads-up that never posts can still be handed over. No fee is sent on a
 * network without a memo board. The main action then spends the fresh note.
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
import { assertNoteOnNetwork, assetLabel, dropUnsentNote, formatAssetLabel, saveLocalNote, updateLocalNote, type LocalNote } from "./shield";
import { buildNotePackage, encodeNotePackage } from "./notePackage";
import { encryptTicketForTag, isValidReceiveTag } from "./receiveTag";
import { ticketToMemoBytes } from "./payMemo";
import { freshPath, splitMaybeSent, splitNotes } from "./cashOutSplit";
import type { FeeKind } from "./partnerFeeMath";
import { makeSentLink, paymentNullifier } from "./sentLinks";
import { removeSentLink, saveSentLink } from "./sentLinksStore";

export const FEE_MAYBE_SENT =
  "The partner fee may have gone out. Your money is safe in the vault and shows again once it lands. Then try again from there.";
export const FEE_REVERTED = "The partner fee didn't go through on this try. Your money is safe in the vault: refresh, then try again.";
export const FEE_NEEDS_RELAY = "This link's partner fee goes through the Gloam relay, which is off right now. Try again shortly.";
export const FEE_NO_MEMO = "This network has no payment memo board yet, so a partner fee could not reach the partner. Nothing was sent.";

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
  // the fee note's secret reaches the partner only through its heads-up on the memo board
  if (!net.payMemo) throw new Error(FEE_NO_MEMO);
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
  // The fee's sealed code goes under Sent links before anything is sent, like any payment to a
  // Gloam address: if its heads-up never posts, it is the only way the partner can open the fee.
  const feeLink = makeSentLink({
    code: ticket,
    chainId: note.chainId,
    pool: note.pool,
    asset: w.paymentNote.asset,
    symbol: assetLabel(w.paymentNote.asset),
    amountWei: w.paymentNote.amountWei,
    nullifier: await paymentNullifier(w.paymentNote.secret, w.paymentNote.commitment).catch(() => undefined),
    note: "Partner fee",
  });
  try {
    await saveSentLink(feeLink);
  } catch {
    dropUnsentNote(rest.id);
    throw new Error("Could not keep the partner fee's code in this browser. Nothing was sent.");
  }

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
    void removeSentLink(feeLink.id).catch(() => undefined);
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

  // the partner's heads-up: best effort, the fee has landed either way, and its code stays under Sent links
  void relayMemo({ chainId: note.chainId, paymentCommitment, memo: ticketToMemoBytes(ticket) }).catch(() => undefined);
  if (!at) throw new Error("The partner fee is paid. Refresh, then send again from your balance.");
  return { ...rest, sweepPending: false, txHash: hash, leafIndex: at.leafIndex };
}
