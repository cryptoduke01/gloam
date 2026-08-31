import { defineChain } from "viem";

/** Robinhood Chain mainnet */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://explorer.mainnet.chain.robinhood.com",
    },
  },
});

/** Robinhood Chain testnet, product default */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export const PRODUCT_CHAIN = robinhoodTestnet;
export const PRODUCT_CHAIN_ID = robinhoodTestnet.id;

/** Future canonical host; today the product lives at gloam.trade/app */
export const PRODUCT_HOST_FUTURE = "testnet.gloam.trade";
export const PRODUCT_PATH = "/app";

export const EXPLORER_TX = (hash: string) =>
  `${robinhoodTestnet.blockExplorers.default.url}/tx/${hash}`;

export const EXPLORER_ADDRESS = (addr: string) =>
  `${robinhoodTestnet.blockExplorers.default.url}/address/${addr}`;

export function shortAddress(addr: string, chars = 4) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatEth(wei: bigint, digits = 4) {
  const whole = Number(wei) / 1e18;
  if (!Number.isFinite(whole)) return "0";
  if (whole === 0) return "0";
  if (whole < 0.0001) return "<0.0001";
  return whole.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/** EIP-3085 params for wallets that need the chain added first */
export const RH_TESTNET_WALLET_PARAMS = {
  chainId: `0x${PRODUCT_CHAIN_ID.toString(16)}`,
  chainName: robinhoodTestnet.name,
  nativeCurrency: robinhoodTestnet.nativeCurrency,
  rpcUrls: [...robinhoodTestnet.rpcUrls.default.http],
  blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url],
} as const;

/**
 * Ask the injected wallet to add + switch to Robinhood testnet.
 * Use when the user is connected on the wrong network for writes.
 */
export async function ensureRhTestnetWallet(): Promise<boolean> {
  const eth = (
    globalThis as unknown as {
      ethereum?: {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!eth?.request) return false;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RH_TESTNET_WALLET_PARAMS.chainId }],
    });
    return true;
  } catch (e) {
    const code = (e as { code?: number })?.code;
    // 4902 = chain not added
    if (code === 4902 || code === -32603) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [RH_TESTNET_WALLET_PARAMS],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
