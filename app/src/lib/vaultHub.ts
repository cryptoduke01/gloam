/**
 * The Vault's landing and its action row (components/app/VaultHub): each
 * action's name, its short name for the phone row, one plain line about what
 * it does, the deep link that opens it (the links the app already serves:
 * /app/vault?tab=…&mode=…), which action a URL opens (none is the overview),
 * why one can't be used yet, and which wallet balance to suggest adding
 * first. Pure, so scripts/selftest-vault-hub.mts can hold it.
 *
 * What each line says about privacy follows /docs/privacy-model: adding and
 * cashing out are public transfers, a private payment hides who paid whom and
 * how much, and a swap hides who swapped but not its tokens or amounts.
 */

export type VaultActionId = "shield" | "pay" | "receive" | "swap" | "cashout" | "trade" | "send";

export type VaultActionInfo = {
  id: VaultActionId;
  label: string;
  /** The phone row's name, where five sit side by side. */
  short: string;
  /** One plain line: what it does, and what shows. */
  line: string;
  tab: "shield" | "move" | "swap" | "trade" | "send";
  /** Pay's mode (components/app/MoveView); Send leaves it out. */
  mode?: "receive" | "cashout";
  /** Spends the private balance, so it waits until there is one. */
  spends?: boolean;
  /** Not one of the main actions: listed after them where the network has it. */
  extra?: boolean;
  /** Only where a vault swap router is deployed and open to this wallet (lib/vaultSwap). */
  swapOnly?: boolean;
  /** Only where tokenized stocks trade (Robinhood Chain testnet). */
  stocksOnly?: boolean;
  /** Sends the chain's native coin, which Tempo does not have. */
  nativeOnly?: boolean;
};

/** In the order money moves: in, around, out. */
export const VAULT_ACTIONS: readonly VaultActionInfo[] = [
  {
    id: "shield",
    label: "Add privately",
    short: "Add",
    tab: "shield",
    line: "Move money from your wallet into your private balance.",
  },
  {
    id: "pay",
    label: "Pay privately",
    short: "Pay",
    tab: "move",
    spends: true,
    line: "Send from your private balance. The amount and the link between you stay sealed.",
  },
  {
    id: "receive",
    label: "Receive",
    short: "Receive",
    tab: "move",
    mode: "receive",
    line: "Share your Gloam address, or claim a payment someone sent you.",
  },
  {
    id: "swap",
    label: "Swap",
    short: "Swap",
    tab: "swap",
    spends: true,
    swapOnly: true,
    line: "Change tokens inside your private balance. Who swapped stays private; the amounts show.",
  },
  {
    id: "cashout",
    label: "Cash out",
    short: "Cash out",
    tab: "move",
    mode: "cashout",
    spends: true,
    line: "Back to any public wallet. The cash out itself shows on the explorer.",
  },
  {
    id: "trade",
    label: "Trade",
    short: "Trade",
    tab: "trade",
    extra: true,
    stocksOnly: true,
    line: "Tokenized stocks, on the Robinhood Chain testnet.",
  },
  {
    id: "send",
    label: "Public send",
    short: "Public send",
    tab: "send",
    extra: true,
    nativeOnly: true,
    line: "A regular transfer from your wallet. It shows on the explorer.",
  },
];

/** Why a spending action waits, in the words the Vault uses everywhere. */
export const ADD_FIRST = "Add something privately first";

/** The actions this network and wallet have. */
export function vaultActionsFor(opts: { swap: boolean; stocks: boolean; native: boolean }): VaultActionInfo[] {
  return VAULT_ACTIONS.filter(
    (a) => !(a.swapOnly && !opts.swap) && !(a.stocksOnly && !opts.stocks) && !(a.nativeOnly && !opts.native)
  );
}

/**
 * The action a Vault URL opens, or null for the overview. A claim link's
 * fragment opens Receive (older links name no mode), and a link that names
 * only a mode opens that part of Pay. A tab this network does not have opens
 * the overview, which lists what it does have.
 */
export function vaultActionFromUrl(
  tab: string | null,
  mode: string | null,
  hash: string,
  available: readonly VaultActionId[]
): VaultActionId | null {
  const claim = hash.startsWith("#claim=");
  const payPart = mode === "receive" ? "receive" : mode === "cashout" ? "cashout" : "pay";
  let id: VaultActionId | null = null;
  if ((tab === "move" || tab === null) && claim) id = "receive";
  else if (tab === "move") id = payPart;
  else if (tab === null) id = mode === "receive" || mode === "cashout" || mode === "pay" || mode === "send" ? payPart : null;
  else if (tab === "shield" || tab === "swap" || tab === "trade" || tab === "send") id = tab;
  return id !== null && available.includes(id) ? id : null;
}

/**
 * The query string that opens an action. The rest of the query is kept as the
 * Vault always kept it (a network named by a link, say); Pay's mode and an
 * asset picked for Add belong to one action, so they go.
 */
export function vaultActionSearch(id: VaultActionId, search: string): string {
  const a = VAULT_ACTIONS.find((x) => x.id === id);
  const params = new URLSearchParams(search);
  params.delete("mode");
  params.delete("asset");
  if (!a) return params.toString() ? `?${params.toString()}` : "";
  params.delete("tab");
  const head = new URLSearchParams();
  head.set("tab", a.tab);
  if (a.mode) head.set("mode", a.mode);
  const rest = params.toString();
  return `?${head.toString()}${rest ? `&${rest}` : ""}`;
}

/** The link to Add with one asset picked (a token id, or "eth"). */
export function addAssetHref(assetId: string): string {
  return `/app/vault?tab=shield&asset=${encodeURIComponent(assetId)}`;
}

/**
 * Why an action can't be used yet, or null. Only once the private balance is
 * known to be empty: while it loads, or with no wallet, every action opens and
 * says what it needs itself.
 */
export function vaultActionBlocked(
  a: Pick<VaultActionInfo, "spends">,
  s: { known: boolean; hasPrivate: boolean }
): string | null {
  return a.spends && s.known && !s.hasPrivate ? ADD_FIRST : null;
}

/**
 * Of the wallet balances the vault takes, the one to suggest adding: a dollar
 * stablecoin first, then the largest amount; nothing when every one is zero.
 * `amount` is in whole units (1.5 for 1.5 USDC), so tokens with different
 * decimals compare fairly.
 */
export function pickAddAsset<T extends { amount: number; dollar: boolean }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!(r.amount > 0)) continue;
    if (
      best === null ||
      (r.dollar && !best.dollar) ||
      (r.dollar === best.dollar && r.amount > best.amount)
    ) {
      best = r;
    }
  }
  return best;
}
