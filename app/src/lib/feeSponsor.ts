"use client";

/**
 * Who pays network fees on Tempo, and in what.
 *
 * Tempo has no gas coin: every fee is paid in a USD stablecoin. Gloam makes
 * sure someone holding only OUSD can deposit and cash out. Which path applies
 * depends on how they signed in:
 *
 * 1. Passkey (Tempo Wallet). Every transaction Gloam sends is sponsored: the
 *    wallet asks Tempo's fee payer service to co-sign as fee payer, so the user
 *    pays nothing. If sponsorship is switched off (or the sponsor refuses), the
 *    Tempo Wallet still picks a fee token the user actually holds and that the
 *    fee AMM can settle, so PathUSD is never required.
 *
 * 2. Browser wallet (MetaMask, Rabby, ...). These only send standard Ethereum
 *    transactions, which have no fee payer field, so sponsorship is impossible.
 *    Tempo then charges the account's chosen fee token (FeeManager
 *    `setUserToken`), else PathUSD. When an account has no choice set and not
 *    enough PathUSD, Gloam first asks the wallet to set OUSD (or another held
 *    stablecoin) as its fee token, then sends the original transaction. That
 *    one-time `setUserToken` call pays its own fee in the token it sets, so it
 *    works with zero PathUSD.
 *
 * Path 2 is wired into the browser wallet connector (`tempoFeeAware` in
 * lib/wagmi.ts) so call sites do not change. Path 1 lives in lib/tempoWallet.ts.
 */

import {
  createPublicClient,
  encodeFunctionData,
  http,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { CreateConnectorFn } from "wagmi";
import { tempoTestnet } from "./networks";
import { TEMPO_STABLE_TOKENS, type OnchainToken } from "./tokens";

export const TEMPO_CHAIN_ID = tempoTestnet.id;
export const TEMPO_RPC_URL = tempoTestnet.rpcUrls.default.http[0];

// ------------------------------------------------------------------ sponsor

/** Tempo's public Moderato fee payer. No API key; testnet only. */
export const DEFAULT_TEMPO_FEE_PAYER = "https://sponsor.moderato.tempo.xyz";

/**
 * NEXT_PUBLIC_TEMPO_FEE_PAYER: unset uses Tempo's public testnet sponsor, a URL
 * (absolute, or a same-origin path like `/api/sponsor`) points at our own, and
 * `off` turns sponsorship off (passkey users then pay from their own stablecoins).
 */
function readFeePayerUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_TEMPO_FEE_PAYER?.trim();
  if (!raw) return DEFAULT_TEMPO_FEE_PAYER;
  if (/^(off|false|0|none|disabled)$/i.test(raw)) return null;
  return raw;
}

export const TEMPO_FEE_PAYER_URL = readFeePayerUrl();
/** Whether passkey (Tempo Wallet) transactions on Tempo are sponsored. */
export const TEMPO_SPONSORED = TEMPO_FEE_PAYER_URL !== null;

// ------------------------------------------------------------------ fee token

/** Tempo FeeManager precompile (fee token preferences). */
export const FEE_MANAGER: Address = "0xfeec000000000000000000000000000000000000";
export const PATH_USD: Address = "0x20c0000000000000000000000000000000000000";

const OUSD_TOKEN = TEMPO_STABLE_TOKENS.find((t) => t.id === "ousd")!;
export const OUSD: Address = OUSD_TOKEN.address as Address;

export const feeManagerAbi = [
  {
    name: "userTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address", name: "user" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "setUserToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "token" }],
    outputs: [],
  },
] as const;

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** TIP-20 calls whose own token pays the fee when no preference is set. */
const SELF_PAYING_SELECTORS = new Set<string>([
  toFunctionSelector("transfer(address,uint256)"),
  toFunctionSelector("transferWithMemo(address,uint256,bytes32)"),
]);

let client: PublicClient | undefined;
function tempoClient(): PublicClient {
  client ??= createPublicClient({
    chain: tempoTestnet,
    transport: http(TEMPO_RPC_URL),
  }) as PublicClient;
  return client;
}

function sameAddress(a: string | undefined | null, b: string | undefined | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Symbol for a Tempo stablecoin address, if it is one we list. */
export function tempoStableSymbol(token: string | null | undefined): string | null {
  return TEMPO_STABLE_TOKENS.find((t) => sameAddress(t.address, token))?.symbol ?? null;
}

/** The account's fee token preference on Tempo, or null when none is set. */
export async function readFeeToken(address: Address): Promise<Address | null> {
  const token = await tempoClient().readContract({
    address: FEE_MANAGER,
    abi: feeManagerAbi,
    functionName: "userTokens",
    args: [address],
  });
  return sameAddress(token, zeroAddress) ? null : token;
}

/** Calldata for FeeManager.setUserToken(token), OUSD by default. */
export function setFeeTokenData(token: Address = OUSD): Hex {
  return encodeFunctionData({
    abi: feeManagerAbi,
    functionName: "setUserToken",
    args: [token],
  });
}

/**
 * A generous fee budget: 5M gas at twice the current price, floored at one
 * cent. Fees are in attodollars per gas; TIP-20 units are microdollars (1e-6),
 * so microdollars = gas * price / 1e12.
 */
function feeBudget(gasPrice: bigint): bigint {
  const budget = (5_000_000n * gasPrice * 2n) / 10n ** 12n;
  return budget > 10_000n ? budget : 10_000n;
}

export type FeeTokenPlan =
  | { action: "none"; reason: "preference-set" | "pathusd-covers" | "no-funds" }
  | { action: "set"; token: Address; symbol: string };

/**
 * Decides whether a browser wallet needs a fee token set before it can send on
 * Tempo: only when it has no preference and its PathUSD cannot cover a fee.
 * Prefers OUSD, then any other listed stablecoin that covers the budget.
 */
export async function planFeeToken(address: Address): Promise<FeeTokenPlan> {
  const c = tempoClient();
  if (await readFeeToken(address)) return { action: "none", reason: "preference-set" };
  const candidates: OnchainToken[] = [
    OUSD_TOKEN,
    ...TEMPO_STABLE_TOKENS.filter((t) => t.id !== "ousd"),
  ];
  const [gasPrice, ...balances] = await Promise.all([
    c.getGasPrice(),
    ...candidates.map((t) =>
      c.readContract({
        address: t.address as Address,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [address],
      })
    ),
  ]);
  const need = feeBudget(gasPrice);
  const pathIdx = candidates.findIndex((t) => sameAddress(t.address, PATH_USD));
  if (pathIdx >= 0 && balances[pathIdx] >= need) {
    return { action: "none", reason: "pathusd-covers" };
  }
  for (let i = 0; i < candidates.length; i++) {
    if (i === pathIdx) continue;
    if (balances[i] >= need) {
      return { action: "set", token: candidates[i].address as Address, symbol: candidates[i].symbol };
    }
  }
  return { action: "none", reason: "no-funds" };
}

// ------------------------------------------------------------------ browser wallets

type RequestArgs = { method: string; params?: unknown };
type Eip1193Like = { request: (args: RequestArgs) => Promise<unknown> };
type TxParams = { from?: string; to?: string; data?: string; input?: string; chainId?: string | number };

/** Accounts known to have a fee token set this session (no need to re-read). */
const settled = new Set<string>();
const pending = new Map<string, Promise<void>>();

async function isTempoTx(provider: Eip1193Like, tx: TxParams): Promise<boolean> {
  if (tx.chainId !== undefined && tx.chainId !== null) {
    return Number(tx.chainId) === TEMPO_CHAIN_ID;
  }
  const id = await provider.request({ method: "eth_chainId" }).catch(() => null);
  return id !== null && Number(id) === TEMPO_CHAIN_ID;
}

/** True for transactions that already settle their own fee token question. */
function skipsFeeCheck(tx: TxParams): boolean {
  if (sameAddress(tx.to, FEE_MANAGER)) return true;
  const data = (tx.data ?? tx.input ?? "").toLowerCase();
  const isStable = TEMPO_STABLE_TOKENS.some((t) => sameAddress(t.address, tx.to));
  return isStable && SELF_PAYING_SELECTORS.has(data.slice(0, 10));
}

async function ensureFeeToken(provider: Eip1193Like, from: Address): Promise<void> {
  const key = from.toLowerCase();
  if (settled.has(key)) return;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const run = (async () => {
    // A read failure must not block the user's transaction; fall through.
    const plan = await planFeeToken(from).catch(() => null);
    if (!plan) return;
    if (plan.action === "none") {
      if (plan.reason === "preference-set") settled.add(key);
      return;
    }
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: FEE_MANAGER,
          data: setFeeTokenData(plan.token),
          chainId: `0x${TEMPO_CHAIN_ID.toString(16)}`,
        },
      ],
    })) as Hex;
    const receipt = await tempoClient().waitForTransactionReceipt({
      hash,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`Could not set ${plan.symbol} as this wallet's fee token on Tempo.`);
    }
    settled.add(key);
  })().finally(() => pending.delete(key));
  pending.set(key, run);
  return run;
}

const wrapped = new WeakMap<object, unknown>();

/**
 * Wraps a browser wallet's EIP-1193 provider so a Tempo transaction from an
 * account with no fee token and no PathUSD first sets one (see the header).
 * Everything else, including every Robinhood Chain request, passes through.
 */
export function withTempoFeeToken<P>(provider: P): P {
  if (!provider || typeof provider !== "object") return provider;
  const target = provider as unknown as Eip1193Like & object;
  const hit = wrapped.get(target);
  if (hit) return hit as P;
  const request = async (args: RequestArgs) => {
    if (args.method === "eth_sendTransaction" || args.method === "wallet_sendTransaction") {
      const tx = (Array.isArray(args.params) ? args.params[0] : undefined) as TxParams | undefined;
      if (tx?.from && !skipsFeeCheck(tx) && (await isTempoTx(target, tx))) {
        await ensureFeeToken(target, tx.from as Address);
      }
    }
    return target.request(args);
  };
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === "request") return request;
      const v = Reflect.get(t, prop, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  wrapped.set(target, proxy);
  return proxy as unknown as P;
}

/**
 * Applies `withTempoFeeToken` to a wagmi connector (the injected one). Its own
 * methods reach the provider through `this.getProvider()`, so overriding
 * getProvider covers connect, reconnect and every transaction.
 */
export function tempoFeeAware<C extends CreateConnectorFn>(connectorFn: C): C {
  const fn: CreateConnectorFn = (config) => {
    const connector = connectorFn(config);
    return {
      ...connector,
      async getProvider(parameters?: { chainId?: number | undefined }) {
        return withTempoFeeToken(await connector.getProvider(parameters));
      },
    };
  };
  return fn as C;
}
