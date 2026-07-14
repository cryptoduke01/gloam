import { MARKET_DEFS, type LiveQuote, type MarketDef } from "./markets";

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      indicators?: {
        quote?: Array<{ volume?: Array<number | null> }>;
      };
    }>;
  };
};

function formatVol(n: number | undefined) {
  if (!n || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

async function fetchYahoo(symbol: string): Promise<LiveQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Gloam/0.1 (https://gloam.trade)",
      Accept: "application/json",
    },
    next: { revalidate: 30 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as YahooChart;
  const result = data.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  if (price == null || !Number.isFinite(price)) return null;
  const prev =
    result?.meta?.previousClose ??
    result?.meta?.chartPreviousClose ??
    price;
  const change24h = prev ? ((price - prev) / prev) * 100 : 0;
  const volumes = result?.indicators?.quote?.[0]?.volume ?? [];
  const lastVol = [...volumes].reverse().find((v) => v != null && v > 0);
  return {
    mark: price,
    change24h: Number(change24h.toFixed(2)),
    volume: formatVol(lastVol ?? undefined),
    source: "yahoo",
    updatedAt: Date.now(),
  };
}

type CgSimple = Record<
  string,
  { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }
>;

async function fetchCoinGecko(ids: string[]): Promise<Map<string, LiveQuote>> {
  const map = new Map<string, LiveQuote>();
  if (ids.length === 0) return map;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
    ","
  )}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) return map;
  const data = (await res.json()) as CgSimple;
  for (const id of ids) {
    const row = data[id];
    if (!row?.usd) continue;
    map.set(id, {
      mark: row.usd,
      change24h: Number((row.usd_24h_change ?? 0).toFixed(2)),
      volume: formatVol(row.usd_24h_vol),
      source: "coingecko",
      updatedAt: Date.now(),
    });
  }
  return map;
}

function fallbackQuote(def: MarketDef): LiveQuote {
  return {
    mark: def.fallbackMark,
    change24h: 0,
    volume: "—",
    source: "static",
    updatedAt: Date.now(),
  };
}

/**
 * Server-side live quotes for the product catalog.
 * Stocks → Yahoo chart · Memes → CoinGecko · failures → static fallback.
 */
export async function loadLiveQuotes(): Promise<
  Record<string, LiveQuote & { symbol: string; name: string; kind: string }>
> {
  const cgIds = MARKET_DEFS.map((m) => m.coingecko).filter(
    (id): id is string => Boolean(id)
  );
  const uniqueCg = [...new Set(cgIds)];

  const [cgMap, ...yahooResults] = await Promise.all([
    fetchCoinGecko(uniqueCg).catch(() => new Map<string, LiveQuote>()),
    ...MARKET_DEFS.filter((m) => m.yahoo).map(async (m) => {
      const q = await fetchYahoo(m.yahoo!).catch(() => null);
      return [m.id, q] as const;
    }),
  ]);

  const yahooMap = new Map(yahooResults);

  const out: Record<
    string,
    LiveQuote & { symbol: string; name: string; kind: string }
  > = {};

  for (const def of MARKET_DEFS) {
    let q: LiveQuote | null = null;
    if (def.yahoo) q = yahooMap.get(def.id) ?? null;
    if (!q && def.coingecko) q = cgMap.get(def.coingecko) ?? null;
    if (!q) q = fallbackQuote(def);
    out[def.id] = {
      ...q,
      symbol: def.symbol,
      name: def.name,
      kind: def.kind,
    };
  }

  return out;
}

export async function loadLiveMarkets() {
  const quotes = await loadLiveQuotes();
  return MARKET_DEFS.map((def) => {
    const q = quotes[def.id] ?? fallbackQuote(def);
    return {
      ...def,
      mark: q.mark,
      change24h: q.change24h,
      volume: q.volume,
      source: q.source,
      updatedAt: q.updatedAt,
    };
  });
}
