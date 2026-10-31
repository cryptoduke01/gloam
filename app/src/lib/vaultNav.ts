/**
 * The Vault's actions as places in the app nav. Each one is a deep link the
 * app already serves (/app/vault?tab=…&mode=…), so old links keep working; the
 * nav lists them under Vault so paying privately, receiving and cashing out
 * are findable without knowing they sit inside the Vault.
 */

export type VaultActionId = "shield" | "pay" | "receive" | "swap" | "cashout" | "topups" | "trade" | "send";

/** Pay's three modes (components/app/MoveView). */
export type MoveMode = "send" | "receive" | "cashout";

export type VaultAction = {
  id: VaultActionId;
  label: string;
  href: string;
  /** Only where a vault swap router is deployed and open to this wallet (lib/vaultSwap). */
  swapOnly?: boolean;
  /** Only where tokenized stocks trade (Robinhood Chain testnet). */
  stocksOnly?: boolean;
};

/** In the order money moves: in, around, out. */
export const VAULT_ACTIONS: readonly VaultAction[] = [
  { id: "shield", label: "Add privately", href: "/app/vault?tab=shield" },
  { id: "pay", label: "Pay privately", href: "/app/vault?tab=move" },
  { id: "receive", label: "Receive", href: "/app/vault?tab=move&mode=receive" },
  { id: "swap", label: "Swap", href: "/app/vault?tab=swap", swapOnly: true },
  { id: "cashout", label: "Cash out", href: "/app/vault?tab=move&mode=cashout" },
  { id: "topups", label: "Agent top-ups", href: "/app/vault?tab=topups" },
  { id: "trade", label: "Trade", href: "/app/vault?tab=trade", stocksOnly: true },
  { id: "send", label: "Public send", href: "/app/vault?tab=send" },
];

/** The actions this network and wallet have, the same rules the Vault's own tabs use. */
export function vaultActionsFor(opts: { swap: boolean; stocks: boolean }): VaultAction[] {
  return VAULT_ACTIONS.filter(
    (a) => !(a.swapOnly && !opts.swap) && !(a.stocksOnly && !opts.stocks)
  );
}

/** Pay's mode from ?mode=. A payment request link says mode=pay, which is Send. */
export function moveModeFromParam(param: string | null): MoveMode {
  return param === "receive" || param === "cashout" ? param : "send";
}

/**
 * The Vault action a URL shows, or null for the Vault's overview: a missing or
 * unknown tab, or one this network does not have, opens the overview, which
 * lists what the network does have (components/app/VaultHome).
 */
export function vaultActionFromParams(
  tab: string | null,
  mode: string | null,
  available: readonly VaultAction[] = VAULT_ACTIONS
): VaultActionId | null {
  let id: VaultActionId | null;
  if (tab === "move") {
    const m = moveModeFromParam(mode);
    id = m === "send" ? "pay" : m;
  } else if (tab === "shield" || tab === "swap" || tab === "topups" || tab === "trade" || tab === "send") {
    id = tab;
  } else {
    id = null;
  }
  return id !== null && available.some((a) => a.id === id) ? id : null;
}

/**
 * The query string with Pay's mode written in, or null when it already says
 * that mode. Send leaves the parameter out (or keeps mode=pay from a request
 * link); everything else in the query is kept as it is.
 */
export function searchWithMoveMode(search: string, mode: MoveMode): string | null {
  const params = new URLSearchParams(search);
  if (moveModeFromParam(params.get("mode")) === mode) return null;
  if (mode === "send") params.delete("mode");
  else params.set("mode", mode);
  const s = params.toString();
  return s ? `?${s}` : "";
}
