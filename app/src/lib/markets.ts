export type MarketKind = "stock" | "meme";

export type MarketSource = "live" | "static";

export type MarketDef = {
  id: string;
  symbol: string;
  name: string;
  kind: MarketKind;
  yahoo?: string;
  coingecko?: string;
  /** Testnet ERC-20 when this is a real onchain asset */
  address?: `0x${string}`;
  fallbackMark: number;
  privateReady: boolean;
};

export type LiveQuote = {
  mark: number;
  change24h: number;
  volume: string;
  source: MarketSource;
  updatedAt: number;
  spark?: number[];
};

export type Market = MarketDef & LiveQuote;

/**
 * Catalog: faucet stock tokens first (real onchain), then more equities + memes.
 */
export const MARKET_DEFS: MarketDef[] = [
  {
    id: "tsla",
    symbol: "TSLA",
    name: "Tesla",
    kind: "stock",
    yahoo: "TSLA",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    fallbackMark: 250,
    privateReady: false,
  },
  {
    id: "amzn",
    symbol: "AMZN",
    name: "Amazon",
    kind: "stock",
    yahoo: "AMZN",
    address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    fallbackMark: 190,
    privateReady: false,
  },
  {
    id: "pltr",
    symbol: "PLTR",
    name: "Palantir",
    kind: "stock",
    yahoo: "PLTR",
    address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    fallbackMark: 80,
    privateReady: false,
  },
  {
    id: "nflx",
    symbol: "NFLX",
    name: "Netflix",
    kind: "stock",
    yahoo: "NFLX",
    address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    fallbackMark: 900,
    privateReady: false,
  },
  {
    id: "amd",
    symbol: "AMD",
    name: "AMD",
    kind: "stock",
    yahoo: "AMD",
    address: "0x71178BAc73cBeb415514eB542a8995b82669778d",
    fallbackMark: 120,
    privateReady: false,
  },
  {
    id: "hood",
    symbol: "HOOD",
    name: "Robinhood",
    kind: "stock",
    yahoo: "HOOD",
    fallbackMark: 100,
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
    id: "msft",
    symbol: "MSFT",
    name: "Microsoft",
    kind: "stock",
    yahoo: "MSFT",
    fallbackMark: 420,
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
];

export const MARKETS: Market[] = MARKET_DEFS.map((d) => ({
  ...d,
  mark: d.fallbackMark,
  change24h: 0,
  volume: "—",
  source: "static" as const,
  updatedAt: 0,
  spark: [],
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

export function formatUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 0.01 && n > 0) return "<$0.01";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 10 ? 2 : 0,
  });
}

export function formatTokenAmount(raw: bigint, decimals = 18, maxDigits = 4) {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}
