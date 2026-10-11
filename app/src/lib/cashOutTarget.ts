/**
 * Where a cash out may not go. Shared by the app (before proving) and the
 * relay (before anything is checked or sent).
 *
 * A cash out to the vault itself lowers the vault's books while the money
 * stays put: the coin becomes a surplus only the owner can sweep, and a token
 * is stuck for good (audit I-3). The memo board has no way to pay anything
 * out either. Only the note owner picks the address, so this guards against a
 * slip, not an attack.
 */

export const CASH_OUT_TO_VAULT_MESSAGE = "That address is the vault itself. Cash out to a wallet you control.";
export const CASH_OUT_TO_BOARD_MESSAGE =
  "That address is Gloam's payment message board. Cash out to a wallet you control.";

type VaultAddresses = {
  pool: string | null;
  payMemo?: { address: string } | null;
};

function same(a: string, b: string | null | undefined): boolean {
  return Boolean(b) && a.trim().toLowerCase() === b!.trim().toLowerCase();
}

/** Why a cash out to `to` on this network would be lost, or null when it is fine. */
export function cashOutTargetProblem(to: string, net: VaultAddresses): string | null {
  if (same(to, net.pool)) return CASH_OUT_TO_VAULT_MESSAGE;
  if (same(to, net.payMemo?.address)) return CASH_OUT_TO_BOARD_MESSAGE;
  return null;
}
