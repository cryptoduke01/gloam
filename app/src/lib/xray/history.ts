/**
 * From a wallet's Transfer logs to the facts on its receipt. Pure, so the
 * selftest can check it. Everything here is counted from the logs handed in,
 * and a figure with nothing behind it is left out (undefined), never guessed.
 *
 * What logs cannot show: plain ETH transfers leave none, and only the tokens
 * Gloam lists are read. So these are facts about those tokens, and the page
 * says so.
 */

import { zeroAddress } from "viem";

export type XrayToken = { address: string; symbol: string; decimals: number; stock: boolean };

/** One Transfer log. Addresses are lowercase. */
export type XrayTransfer = {
  token: string;
  from: string;
  to: string;
  value: bigint;
  block: bigint;
  tx: string;
  logIndex: number;
};

/** A transfer on the receipt. `counterparty` is null for a mint or a burn: nobody on the other side. */
export type XrayFlow = { usd: number; amount: string; symbol: string; counterparty: string | null };

export type XrayFacts = {
  transfers: number;
  firstBlock: bigint | null;
  lastBlock: bigint | null;
  /** Who sent the first token this wallet received, with what. Left out when that first arrival was a mint. */
  firstFunder?: { address: string; amount: string; symbol: string; block: bigint };
  biggestIn?: XrayFlow;
  biggestOut?: XrayFlow;
  /** Different addresses it has sent to or received from. */
  counterparties: number;
  topCounterparty?: { address: string; transfers: number };
  /** Transactions swapping a stock token against another token. */
  stockTrades: number;
  /** The stocks those trades touched, most traded first. */
  stocksTraded: string[];
};

/** Transactions in `rows` where a stock moved, oldest first: the ones worth reading a receipt for. */
export function stockTxs(rows: readonly XrayTransfer[], tokens: ReadonlyMap<string, XrayToken>): string[] {
  return [...new Set(dedupeTransfers(rows).filter((r) => tokens.get(r.token)?.stock).sort(byChainOrder).map((r) => r.tx))];
}

/** The widest span the Robinhood Chain RPC takes for one token and one address. */
const SPAN = 10_000_000n;

/** Inclusive block ranges of at most SPAN, from `from` to `to`. */
export function spansFrom(from: bigint, to: bigint): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let a = from; a <= to; a += SPAN) {
    const b = a + SPAN - 1n;
    out.push([a, b < to ? b : to]);
  }
  return out;
}

/** One log can come back from both sides of a read (a wallet paying itself); keep each once. */
export function dedupeTransfers(rows: readonly XrayTransfer[]): XrayTransfer[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.tx}:${r.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function byChainOrder(a: XrayTransfer, b: XrayTransfer): number {
  if (a.block !== b.block) return a.block < b.block ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/**
 * A stock trade: one transaction where the wallet's stock balance goes one way
 * and another token goes the other. Worked out from net moves, so a transfer
 * routed through the wallet in and straight out does not count, and a stock
 * simply received from someone is not a trade. Trades here often settle in a
 * token Gloam does not list, so `rows` includes those moves where the caller has
 * read them. A buy paid in plain ETH shows no second token, so it is not counted.
 */
function stockTrades(wallet: string, rows: readonly XrayTransfer[], tokens: ReadonlyMap<string, XrayToken>) {
  const byTx = new Map<string, Map<string, bigint>>();
  for (const r of rows) {
    const net = byTx.get(r.tx) ?? new Map<string, bigint>();
    if (r.to === wallet) net.set(r.token, (net.get(r.token) ?? 0n) + r.value);
    if (r.from === wallet) net.set(r.token, (net.get(r.token) ?? 0n) - r.value);
    byTx.set(r.tx, net);
  }
  let count = 0;
  const perStock = new Map<string, number>();
  for (const net of byTx.values()) {
    const moves = [...net].filter(([, v]) => v !== 0n);
    const traded = moves.filter(
      ([t, v]) => tokens.get(t)?.stock && moves.some(([other, w]) => other !== t && w < 0n !== v < 0n)
    );
    if (!traded.length) continue;
    count++;
    for (const [t] of traded) {
      const symbol = tokens.get(t)!.symbol;
      perStock.set(symbol, (perStock.get(symbol) ?? 0) + 1);
    }
  }
  const stocksTraded = [...perStock].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
  return { count, stocksTraded };
}

/**
 * The facts in `rows` for `wallet` (lowercase). `usdOf` prices a transfer at
 * today's price, null when nothing prices the token, and such a transfer can
 * not be ranked, so it is never the biggest. `otherMoves` are the wallet's moves
 * in tokens outside the list, read from receipts: they only show what a stock
 * was traded against, and count towards nothing else.
 */
export function factsFrom(
  wallet: string,
  rows: readonly XrayTransfer[],
  tokens: ReadonlyMap<string, XrayToken>,
  usdOf: (r: XrayTransfer) => { usd: number | null; amount: string },
  otherMoves: readonly XrayTransfer[] = []
): XrayFacts {
  const moved = dedupeTransfers(rows).sort(byChainOrder);
  const counts = new Map<string, number>();
  let biggestIn: XrayFlow | undefined;
  let biggestOut: XrayFlow | undefined;

  for (const r of moved) {
    const inbound = r.to === wallet && r.from !== wallet;
    const outbound = r.from === wallet && r.to !== wallet;
    if (!inbound && !outbound) continue;
    const other = inbound ? r.from : r.to;
    if (other !== zeroAddress) counts.set(other, (counts.get(other) ?? 0) + 1);
    const { usd, amount } = usdOf(r);
    const symbol = tokens.get(r.token)?.symbol;
    if (usd == null || !symbol) continue;
    const flow = { usd, amount, symbol, counterparty: other === zeroAddress ? null : other };
    if (inbound && usd > (biggestIn?.usd ?? 0)) biggestIn = flow;
    if (outbound && usd > (biggestOut?.usd ?? 0)) biggestOut = flow;
  }

  let topCounterparty: XrayFacts["topCounterparty"];
  for (const [address, transfers] of counts) {
    if (!topCounterparty || transfers > topCounterparty.transfers) topCounterparty = { address, transfers };
  }

  const first = moved.find((r) => r.to === wallet && r.from !== wallet);
  const token = first ? tokens.get(first.token) : undefined;
  const firstFunder =
    first && token && first.from !== zeroAddress
      ? { address: first.from, amount: usdOf(first).amount, symbol: token.symbol, block: first.block }
      : undefined;

  const trades = stockTrades(wallet, dedupeTransfers([...moved, ...otherMoves]), tokens);
  return {
    transfers: moved.length,
    firstBlock: moved[0]?.block ?? null,
    lastBlock: moved[moved.length - 1]?.block ?? null,
    ...(firstFunder ? { firstFunder } : {}),
    ...(biggestIn ? { biggestIn } : {}),
    ...(biggestOut ? { biggestOut } : {}),
    counterparties: counts.size,
    ...(topCounterparty ? { topCounterparty } : {}),
    stockTrades: trades.count,
    stocksTraded: trades.stocksTraded,
  };
}
