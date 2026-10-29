/**
 * What a vault can hold, and how a held token is priced. Shared by the server's
 * figures (lib/onchainMetrics: admin, the stats API, the MCP, /stats) and the
 * browser's own read on /transparency, so both list the same assets and price
 * them the same way. No server imports here: this runs in the browser too.
 */

import { RH_MAINNET_SWAP_TOKENS, shieldTokensFor, type OnchainToken } from "./tokens";

/**
 * Tokens a private swap can land in that Add does not list, per chain. Only
 * Robinhood Chain mainnet has any (lib/vaultSwap RH_SWAP_ASSETS_V2): Tempo's
 * swap assets are its four listed stablecoins, and Base and Ethereum have no
 * private swap yet.
 */
export const SWAP_LANDABLE: Record<number, readonly OnchainToken[]> = { 4663: RH_MAINNET_SWAP_TOKENS };

const holdable = new Map<number, OnchainToken[]>();

/**
 * Every ERC-20 the vault on a chain can hold: the tokens Add lists plus the
 * ones a private swap lands in, listed first, each address once. Reading only
 * the listed set left a vault's stocks, WETH and the rest out of "held".
 */
export function holdableTokens(chainId: number): OnchainToken[] {
  const hit = holdable.get(chainId);
  if (hit) return hit;
  const seen = new Set<string>();
  const out: OnchainToken[] = [];
  for (const t of [...shieldTokensFor(chainId), ...(SWAP_LANDABLE[chainId] ?? [])]) {
    const a = t.address.toLowerCase();
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(t);
  }
  holdable.set(chainId, out);
  return out;
}

/**
 * A Robinhood mainnet stock token is worth the share price times its
 * uiMultiplier / 1e18 per raw token (splits and dividends move the multiplier;
 * balances never rebase), as the private swap marks it (VaultSwapView).
 */
export function hasUiMultiplier(chainId: number, t: Pick<OnchainToken, "kind">): boolean {
  return chainId === 4663 && t.kind === "stock";
}

/**
 * USD for one whole swap-landable token, or null: a stock is the live market
 * mark with the token's id times uiMultiplier / 1e18, else the CoinGecko price
 * for the token; any other token is its CoinGecko price. The same order
 * VaultSwapView and /api/markets use, so no page disagrees with the app.
 */
export function swapTokenPrice(
  chainId: number,
  t: Pick<OnchainToken, "id" | "kind">,
  markets: readonly { id: string; source: string; mark: number }[],
  uiMultiplier: bigint | null,
  geckoUsd: number | undefined
): number | null {
  let price: number | null = null;
  if (hasUiMultiplier(chainId, t)) {
    const m = markets.find((x) => x.id === t.id && x.source === "live" && x.mark > 0);
    if (m && uiMultiplier && uiMultiplier > 0n) price = (m.mark * Number(uiMultiplier)) / 1e18;
  }
  if (price == null && typeof geckoUsd === "number" && geckoUsd > 0) price = geckoUsd;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}
