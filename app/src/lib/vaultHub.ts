/**
 * The Vault's overview and its action row (components/app/VaultHome,
 * components/app/VaultHub), on top of the app nav's list of Vault actions
 * (lib/vaultNav: ids, names, deep links, which networks have them). This adds
 * what the Vault page itself needs: a short name for the phone row, one plain
 * line about what each action does, which ones spend the private balance (so
 * they wait until there is one), which action a URL opens (none is the
 * overview), and which wallet balance to suggest adding first. Pure, so
 * scripts/selftest-vault-hub.mts can hold it.
 *
 * What each line says about privacy follows /docs/privacy-model: adding and
 * cashing out are public transfers, a private payment hides who paid whom and
 * how much, and a swap hides who swapped but not its tokens or amounts.
 */
import type { LocalNote } from "./shield";
import {
  VAULT_ACTIONS as NAV_ACTIONS,
  vaultActionFromParams,
  vaultActionsFor as navActionsFor,
  type VaultAction,
  type VaultActionId,
} from "./vaultNav";

export type { VaultActionId };

export type VaultActionInfo = VaultAction & {
  /** The phone row's name, where five sit side by side. */
  short: string;
  /** One plain line: what it does, and what shows. */
  line: string;
  /** The Vault tab it opens (?tab=), and Pay's part (?mode=) for Receive and Cash out. */
  tab: "shield" | "move" | "swap" | "topups" | "trade" | "send";
  mode?: "receive" | "cashout";
  /** Spends the private balance, so it waits until there is one. */
  spends?: boolean;
  /** Not one of the five main actions: listed after them where the network has it. */
  extra?: boolean;
};

const COPY: Record<VaultActionId, Pick<VaultActionInfo, "short" | "line" | "spends" | "extra">> = {
  shield: { short: "Add", line: "Move money from your wallet into your private balance." },
  pay: {
    short: "Pay",
    spends: true,
    line: "Send from your private balance. The amount and the link between you stay sealed.",
  },
  receive: { short: "Receive", line: "Share your Gloam address, or claim a payment someone sent you." },
  swap: {
    short: "Swap",
    spends: true,
    line: "Change tokens inside your private balance. Who swapped stays private; the amounts show.",
  },
  cashout: {
    short: "Cash out",
    spends: true,
    line: "Back to any public wallet. The cash out itself shows on the explorer.",
  },
  topups: {
    short: "Top-ups",
    spends: true,
    extra: true,
    line: "Refill an agent's wallet on a schedule, with Gloam closed. Each top-up shows on the explorer.",
  },
  trade: { short: "Trade", extra: true, line: "Tokenized stocks, on the Robinhood Chain testnet." },
  send: { short: "Public send", extra: true, line: "A regular transfer from your wallet. It shows on the explorer." },
};

function withCopy(a: VaultAction): VaultActionInfo {
  const q = new URLSearchParams(a.href.split("?")[1] ?? "");
  const mode = q.get("mode");
  return {
    ...a,
    ...COPY[a.id],
    tab: (q.get("tab") ?? "shield") as VaultActionInfo["tab"],
    mode: mode === "receive" || mode === "cashout" ? mode : undefined,
  };
}

/** In the order money moves: in, around, out; then Agent top-ups, Trade and Public send. */
export const VAULT_ACTIONS: readonly VaultActionInfo[] = NAV_ACTIONS.map(withCopy);

/** The actions this network and wallet have, the same as the app nav lists. */
export function vaultActionsFor(opts: { swap: boolean; stocks: boolean; native: boolean }): VaultActionInfo[] {
  return navActionsFor(opts).map(withCopy);
}

/**
 * What prepaid agent top-ups hold out of the balance now, by asset
 * (lib/agentTopUp). It left the private balance when it was set aside and can
 * stay out for months, so the overview says where it went.
 */
export function topUpsSetAside(notes: readonly Pick<LocalNote, "asset" | "amountWei" | "status" | "cashOut" | "cashOutPlan" | "proofOutAt">[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const n of notes) {
    const state = n.cashOut?.state;
    const waits = state === "scheduled" || state === "sent";
    // one on its way back to a fresh note is out of the balance too, until it lands
    if (!n.cashOutPlan?.topUp || n.status === "recovered" || (!waits && !n.proofOutAt)) continue;
    const k = n.asset.toLowerCase();
    out.set(k, (out.get(k) ?? BigInt(0)) + BigInt(n.amountWei));
  }
  return out;
}

/** Why a spending action waits, in the words the Vault uses everywhere. */
export const ADD_FIRST = "Add something privately first";

/**
 * The action a Vault URL opens, or null for the overview: the nav's reading of
 * ?tab= and ?mode= (lib/vaultNav), plus a claim link's fragment, which opens
 * Receive (older claim links name no mode; Pay reads the code and clears it).
 */
export function vaultActionFromUrl(
  tab: string | null,
  mode: string | null,
  hash: string,
  available: readonly VaultActionInfo[]
): VaultActionId | null {
  if ((tab === "move" || tab === null) && hash.startsWith("#claim=") && available.some((a) => a.id === "receive")) {
    return "receive";
  }
  return vaultActionFromParams(tab, mode, available);
}

/**
 * The fragment the Vault reads its action from, once the query has changed.
 * Pay reads a claim link's code and clears the fragment without a hashchange,
 * so the fragment the Vault read on arrival would hold the row on Receive
 * after the URL moved on (the nav's Pay privately or Cash out, a step after a
 * claim). A query that names an action of its own reads the fragment again
 * from the address bar (`live`); one that names none, like an old claim link
 * without a tab that Pay gave a mode, keeps the fragment it had (`kept`).
 */
export function vaultHashAfterQuery(kept: string, live: string, tab: string | null, mode: string | null): string {
  return vaultActionFromParams(tab, mode) === null ? kept : live;
}

/**
 * The query string that opens an action. The rest of the query is kept as the
 * Vault always kept it (a network named by a link, say); Pay's mode and an
 * asset picked for Add belong to one action, so they go.
 */
export function vaultActionSearch(id: VaultActionId, search: string): string {
  const a = VAULT_ACTIONS.find((x) => x.id === id);
  const rest = new URLSearchParams(search);
  rest.delete("tab");
  rest.delete("mode");
  rest.delete("asset");
  const head = new URLSearchParams(a ? (a.href.split("?")[1] ?? "") : "");
  const tail = rest.toString();
  return `?${head.toString()}${tail ? `&${tail}` : ""}`;
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
    if (best === null || (r.dollar && !best.dollar) || (r.dollar === best.dollar && r.amount > best.amount)) {
      best = r;
    }
  }
  return best;
}

/**
 * One order for a list of balances, wherever the Vault shows one (the
 * overview's private and wallet panes, the Add page's private balance):
 * dollar stablecoins first, then the larger holding, then by name.
 */
export function compareHoldings(
  a: { dollar: boolean; amount: number; symbol: string },
  b: { dollar: boolean; amount: number; symbol: string }
): number {
  return Number(b.dollar) - Number(a.dollar) || b.amount - a.amount || a.symbol.localeCompare(b.symbol);
}
