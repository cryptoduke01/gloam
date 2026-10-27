/**
 * Where a cash out may not go. Shared by the app (before proving) and the
 * relay (before anything is checked or sent).
 *
 * A cash out to the vault itself lowers the vault's books while the money
 * stays put: the coin becomes a surplus only the owner can sweep, and a token
 * is stuck for good (audit I-3). The memo board has no way to pay anything
 * out either. Nor does a token contract (the asset's own, or any other token
 * Gloam lists on the network), and a swap router hands whatever it holds to
 * the treasury on its next swap. The zero address is refused by the vault,
 * but only after a split cash out has already spent its first step. Only the
 * note owner picks the address, so this guards against a slip, not an attack.
 */
import { shieldTokensFor } from "./tokens";
import { swapRoutersOn } from "./vaultSwap";

export const CASH_OUT_TO_VAULT_MESSAGE = "That address is the vault itself. Cash out to a wallet you control.";
export const CASH_OUT_TO_BOARD_MESSAGE =
  "That address is Gloam's payment message board. Cash out to a wallet you control.";
export const CASH_OUT_TO_TOKEN_MESSAGE =
  "That address is a token contract, not a wallet. Money sent there cannot be recovered. Cash out to a wallet you control.";
export const CASH_OUT_TO_ROUTER_MESSAGE =
  "That address is Gloam's swap router. Money sent there cannot be recovered. Cash out to a wallet you control.";
export const CASH_OUT_TO_ZERO_MESSAGE =
  "That is the zero address, which nobody controls. Cash out to a wallet you control.";

type VaultAddresses = {
  chainId: number;
  pool: string | null;
  payMemo?: { address: string } | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function same(a: string, b: string | null | undefined): boolean {
  return Boolean(b) && a.trim().toLowerCase() === b!.trim().toLowerCase();
}

/** Why a cash out to `to` on this network would be lost, or null when it is fine. */
export function cashOutTargetProblem(to: string, net: VaultAddresses): string | null {
  if (same(to, net.pool)) return CASH_OUT_TO_VAULT_MESSAGE;
  if (same(to, net.payMemo?.address)) return CASH_OUT_TO_BOARD_MESSAGE;
  if (same(to, ZERO_ADDRESS)) return CASH_OUT_TO_ZERO_MESSAGE;
  const routers = swapRoutersOn(net.chainId);
  if (routers.some((r) => same(to, r.address))) return CASH_OUT_TO_ROUTER_MESSAGE;
  const tokens = [...shieldTokensFor(net.chainId).map((t) => t.address), ...routers.flatMap((r) => r.assets)];
  if (tokens.some((a) => same(to, a))) return CASH_OUT_TO_TOKEN_MESSAGE;
  return null;
}
