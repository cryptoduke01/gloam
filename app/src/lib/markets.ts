export type MarketKind = "stock" | "meme";

export type Market = {
  id: string;
  symbol: string;
  name: string;
  kind: MarketKind;
  /** Display-only placeholder quotes for testnet UI — not live prices */
  mark: number;
  change24h: number;
  volume: string;
  privateReady: boolean;
};

/**
 * Testnet market catalog.
 * Quotes are UI scaffolding until real oracles / pools are wired.
 * Never present as confirmed fills.
 */
export const MARKETS: Market[] = [
  {
    id: "hood",
    symbol: "HOOD",
    name: "Robinhood",
    kind: "stock",
    mark: 24.18,
    change24h: 1.4,
    volume: "12.4M",
    privateReady: false,
  },
  {
    id: "tsla",
    symbol: "TSLA",
    name: "Tesla",
    kind: "stock",
    mark: 248.6,
    change24h: -0.8,
    volume: "31.2M",
    privateReady: false,
  },
  {
    id: "aapl",
    symbol: "AAPL",
    name: "Apple",
    kind: "stock",
    mark: 212.4,
    change24h: 0.3,
    volume: "18.7M",
    privateReady: false,
  },
  {
    id: "nvda",
    symbol: "NVDA",
    name: "NVIDIA",
    kind: "stock",
    mark: 128.9,
    change24h: 2.1,
    volume: "44.1M",
    privateReady: false,
  },
  {
    id: "coin",
    symbol: "COIN",
    name: "Coinbase",
    kind: "stock",
    mark: 248.0,
    change24h: -1.2,
    volume: "9.6M",
    privateReady: false,
  },
  {
    id: "pepe",
    symbol: "PEPE",
    name: "Pepe",
    kind: "meme",
    mark: 0.0000124,
    change24h: 8.4,
    volume: "2.1M",
    privateReady: false,
  },
  {
    id: "wif",
    symbol: "WIF",
    name: "dogwifhat",
    kind: "meme",
    mark: 1.84,
    change24h: -3.2,
    volume: "4.8M",
    privateReady: false,
  },
  {
    id: "bonk",
    symbol: "BONK",
    name: "Bonk",
    kind: "meme",
    mark: 0.000021,
    change24h: 5.1,
    volume: "3.3M",
    privateReady: false,
  },
  {
    id: "popcat",
    symbol: "POPCAT",
    name: "Popcat",
    kind: "meme",
    mark: 0.42,
    change24h: 12.0,
    volume: "1.9M",
    privateReady: false,
  },
];

export function formatMark(m: Market) {
  if (m.mark < 0.01) {
    return m.mark.toLocaleString(undefined, {
      maximumSignificantDigits: 4,
    });
  }
  return m.mark.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
