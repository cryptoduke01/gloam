/**
 * Robinhood **mainnet** meme / DEX discovery via DexScreener public API.
 * chainId on DexScreener is "robinhood" (mainnet 4663), not testnet.
 */

export type DexPair = {
  id: string;
  symbol: string;
  name: string;
  address: string;
  pairAddress: string;
  priceUsd: number;
  change24h: number;
  volume24h: number;
  liquidityUsd: number;
  url: string;
  dexId: string;
  quote: string;
};

type DsPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
};

const QUERIES = [
  "robinhood",
  "WETH",
  "4663",
  "HOOD",
  "POOCH",
  "meme",
  "cat",
  "doge",
];

async function search(q: string): Promise<DsPair[]> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
    { cache: "no-store", headers: { Accept: "application/json" } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { pairs?: DsPair[] | null };
  return data.pairs ?? [];
}

export async function loadRobinhoodMemes(limit = 40): Promise<DexPair[]> {
  const batches = await Promise.all(QUERIES.map((q) => search(q).catch(() => [])));
  const flat = batches.flat().filter((p) => p.chainId === "robinhood");

  const byBase = new Map<string, DexPair>();
  for (const p of flat) {
    const addr = p.baseToken?.address?.toLowerCase();
    if (!addr || !p.baseToken?.symbol) continue;
    const price = Number(p.priceUsd ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    const liq = p.liquidity?.usd ?? 0;
    const vol = p.volume?.h24 ?? 0;
    const row: DexPair = {
      id: `meme-${addr.slice(0, 10)}`,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name ?? p.baseToken.symbol,
      address: p.baseToken.address!,
      pairAddress: p.pairAddress ?? "",
      priceUsd: price,
      change24h: Number((p.priceChange?.h24 ?? 0).toFixed(2)),
      volume24h: vol,
      liquidityUsd: liq,
      url: p.url ?? `https://dexscreener.com/robinhood/${p.pairAddress}`,
      dexId: p.dexId ?? "uniswap",
      quote: p.quoteToken?.symbol ?? "WETH",
    };
    const prev = byBase.get(addr);
    if (!prev || row.volume24h > prev.volume24h) {
      byBase.set(addr, row);
    }
  }

  return [...byBase.values()]
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit);
}
