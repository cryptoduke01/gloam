/**
 * Robinhood Chain testnet stock tokens (from public explorer / faucet).
 * Balances are real onchain. USD marks use live equity prices.
 */
export type OnchainToken = {
  id: string;
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  yahoo: string;
  kind: "stock";
};

export const TESTNET_STOCK_TOKENS: OnchainToken[] = [
  {
    id: "tsla",
    symbol: "TSLA",
    name: "Tesla",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    decimals: 18,
    yahoo: "TSLA",
    kind: "stock",
  },
  {
    id: "amzn",
    symbol: "AMZN",
    name: "Amazon",
    address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    decimals: 18,
    yahoo: "AMZN",
    kind: "stock",
  },
  {
    id: "pltr",
    symbol: "PLTR",
    name: "Palantir",
    address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    decimals: 18,
    yahoo: "PLTR",
    kind: "stock",
  },
  {
    id: "nflx",
    symbol: "NFLX",
    name: "Netflix",
    address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    decimals: 18,
    yahoo: "NFLX",
    kind: "stock",
  },
  {
    id: "amd",
    symbol: "AMD",
    name: "AMD",
    address: "0x71178BAc73cBeb415514eB542a8995b82669778d",
    decimals: 18,
    yahoo: "AMD",
    kind: "stock",
  },
];

export const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
