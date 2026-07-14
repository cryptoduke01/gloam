export type MarketKind = "stock" | "meme";

export type MarketSource = "yahoo" | "coingecko" | "static";

export type MarketDef = {
  id: string;
  symbol: string;
  name: string;
  kind: MarketKind;
  yahoo?: string;
  coingecko?: string;
  fallbackMark: number;
  privateReady: boolean;
};

export type LiveQuote = {
  mark: number;
  change24h: number;
  volume: string;
  source: MarketSource;
  updatedAt: number;
};

export type Market = MarketDef & LiveQuote;

/**
 * Product catalog.
 * Live: stocks → Yahoo (server) · memes → CoinGecko (server).
 * Marks are reference prices — never fills.
 */
export const MARKET_DEFS: MarketDef[] = [
  {
    id: "hood",
    symbol: "HOOD",
    name: "Robinhood",
    kind: "stock",
    yahoo: "HOOD",
    fallbackMark: 24,
    privateReady: false,
  },
  {
    id: "tsla",
    symbol: "TSLA",
    name: "Tesla",
    kind: "stock",
    yahoo: "TSLA",
    fallbackMark: 250,
    privateReady: false,
  },
  {
    id: "aapl",
    symbol: "AAPL",
    name: "Apple",
    kind: "stock",
    yahoo: "AAPL",
    fallbackMark: 210,
    privateReady: false,
  },
  {
    id: "nvda",
    symbol: "NVDA",
    name: "NVIDIA",
    kind: "stock",
    yahoo: "NVDA",
    fallbackMark: 130,
    privateReady: false,
  },
  {
    id: "coin",
    symbol: "COIN",
    name: "Coinbase",
    kind: "stock",
    yahoo: "COIN",
    fallbackMark: 250,
    privateReady: false,
  },
  {
    id: "amzn",
    symbol: "AMZN",
    name: "Amazon",
    kind: "stock",
    yahoo: "AMZN",
    fallbackMark: 190,
    privateReady: false,
  },
  {
    id: "msft",
    symbol: "MSFT",
    name: "Microsoft",
    kind: "stock",
    yahoo: "MSFT",
    fallbackMark: 420,
    privateReady: false,
  },
  {
    id: "pepe",
    symbol: "PEPE",
    name: "Pepe",
    kind: "meme",
    coingecko: "pepe",
    fallbackMark: 0.00001,
    privateReady: false,
  },
  {
    id: "wif",
    symbol: "WIF",
    name: "dogwifhat",
    kind: "meme",
    coingecko: "dogwifcoin",
    fallbackMark: 1.5,
    privateReady: false,
  },
  {
    id: "bonk",
    symbol: "BONK",
    name: "Bonk",
    kind: "meme",
    coingecko: "bonk",
    fallbackMark: 0.00002,
    privateReady: false,
  },
  {
    id: "popcat",
    symbol: "POPCAT",
    name: "Popcat",
    kind: "meme",
    coingecko: "popcat",
    fallbackMark: 0.4,
    privateReady: false,
  },
  {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    kind: "meme",
    coingecko: "ethereum",
    fallbackMark: 3500,
    privateReady: false,
  },
];

export const MARKETS: Market[] = MARKET_DEFS.map((d) => ({
  ...d,
  mark: d.fallbackMark,
  change24h: 0,
  volume: "—",
  source: "static" as const,
  updatedAt: 0,
}));

export function formatMark(mark: number) {
  if (mark < 0.01) {
    return mark.toLocaleString(undefined, {
      maximumSignificantDigits: 4,
    });
  }
  if (mark < 1) {
    return mark.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }
  return mark.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMarkMarket(m: { mark: number }) {
  return formatMark(m.mark);
}
