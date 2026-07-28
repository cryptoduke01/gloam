/**
 * Self-contained snapshot of Gloam's testnet surface so the MCP server has no
 * runtime dependency on the web app. Marks are indicative testnet values.
 */

export const CHAIN = {
  name: "Robinhood Chain Testnet",
  chainId: 46630,
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
} as const;

export type Market = {
  id: string;
  symbol: string;
  name: string;
  kind: "stock" | "crypto";
  /** Indicative testnet mark in USD. */
  mark: number;
};

export const MARKETS: Market[] = [
  { id: "tsla", symbol: "TSLA", name: "Tesla", kind: "stock", mark: 250 },
  { id: "amzn", symbol: "AMZN", name: "Amazon", kind: "stock", mark: 190 },
  { id: "pltr", symbol: "PLTR", name: "Palantir", kind: "stock", mark: 80 },
  { id: "nflx", symbol: "NFLX", name: "Netflix", kind: "stock", mark: 900 },
  { id: "amd", symbol: "AMD", name: "AMD", kind: "stock", mark: 120 },
  { id: "hood", symbol: "HOOD", name: "Robinhood", kind: "stock", mark: 100 },
  { id: "aapl", symbol: "AAPL", name: "Apple", kind: "stock", mark: 230 },
  { id: "nvda", symbol: "NVDA", name: "NVIDIA", kind: "stock", mark: 140 },
  { id: "eth", symbol: "ETH", name: "Ether", kind: "crypto", mark: 3500 },
];

export function findMarket(query: string): Market | undefined {
  const q = query.trim().toLowerCase();
  return MARKETS.find(
    (m) =>
      m.id === q ||
      m.symbol.toLowerCase() === q ||
      m.name.toLowerCase() === q
  );
}

/**
 * Honest privacy posture. The MCP server never claims more than the protocol
 * delivers today (this mirrors Gloam's threat-model honesty).
 */
export const PRIVACY_STATUS = {
  network: "testnet",
  provingKeys: "development (not a production ceremony)",
  live: ["shield", "private send", "cash out", "private trade (test rates)"],
  notLive: ["mainnet", "production keys", "audited contracts"],
  anonymitySet:
    "thin on a new pool. Size privacy is only as strong as the pool of same-size notes. Do not treat large exits as fully private yet.",
  note: "Execution of private actions requires a connected agent wallet with signing (e.g. Turnkey). This build exposes read + planning tools; signed execution lands next.",
} as const;
