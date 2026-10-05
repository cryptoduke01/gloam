/**
 * The private note on a payment, like "Invoice 042".
 *
 * It rides inside the payment itself (lib/notePackage), so it only ever sits
 * where the money does: sealed to the payee's Gloam address (gloam2t), locked
 * with a phrase (gloam1e), or inside a claim link's fragment. It is never
 * posted anywhere in the open and never goes into a proof. The payee keeps it
 * on the claimed balance (LocalNote.note), encrypted at rest with the rest.
 *
 * Request links (lib/paymentRequest) clean their note the same way, so a note
 * asked for in a request arrives exactly as it was asked.
 */

export const PAYMENT_NOTE_MAX = 80;

/** Drops control and direction-override characters, squeezes spaces, caps length. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(
    raw
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
    .slice(0, max)
    .join("")
    .trim();
}

/** A payment note as it is sent and stored: cleaned, at most 80 characters. */
export function cleanPaymentNote(raw: unknown): string {
  return cleanText(raw, PAYMENT_NOTE_MAX);
}
