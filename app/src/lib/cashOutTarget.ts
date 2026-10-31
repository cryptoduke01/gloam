/**
 * Where a cash out may not go. Shared by the app (before proving) and the
 * relay (before anything is checked or sent).
 *
 * A cash out to the vault itself lowers the vault's books while the money
 * stays put: the coin becomes a surplus only the owner can sweep, and a token
 * is stuck for good (audit I-3). The memo board has no way to pay anything
 * out either. The same goes for a token contract (the asset's own, or any other
 * token listed on the network) and a swap router, which sends what it holds to
 * the treasury. The zero address the vault refuses itself, but only after a
 * split cash out has already spent its first step. Only the note owner picks
 * the address, so this guards against a slip, not an attack.
 *
 * Token contracts and routers are matched on their own chain only: an address
 * is nobody's wallet on a chain where it is just an address.
 *
 * The rule and its messages are the SDK's, so an agent sending from its own
 * wallet gets the same answer. The app adds its own token and router lists on
 * top, so one added here is refused from that moment, whatever the SDK knows.
 */
import { cashOutTargetProblem as sdkCashOutTargetProblem } from "@gloamtrade/sdk";
import { shieldTokensFor } from "./tokens";
import { swapRoutersOn } from "./vaultSwap";

export {
  CASH_OUT_TO_BOARD_MESSAGE,
  CASH_OUT_TO_ROUTER_MESSAGE,
  CASH_OUT_TO_TOKEN_MESSAGE,
  CASH_OUT_TO_VAULT_MESSAGE,
  CASH_OUT_TO_ZERO_MESSAGE,
} from "@gloamtrade/sdk";

type VaultAddresses = {
  chainId: number;
  pool: string | null;
  payMemo?: { address: string } | null;
};

/** Why a cash out to `to` on this network would be lost, or null when it is fine. */
export function cashOutTargetProblem(to: string, net: VaultAddresses): string | null {
  const routers = swapRoutersOn(net.chainId);
  return sdkCashOutTargetProblem(to, {
    chainId: net.chainId,
    pool: net.pool,
    payMemo: net.payMemo?.address,
    routers: routers.map((r) => r.address),
    // The tokens Gloam lists here, and what a swap can end in (WETH, the stock tokens), listed or not.
    tokens: [...shieldTokensFor(net.chainId).map((t) => t.address), ...routers.flatMap((r) => [...r.assets, ...(r.weth ? [r.weth] : [])])],
  });
}
