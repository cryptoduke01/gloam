"use client";

/**
 * Tempo Wallet (passkey sign-in) as a wagmi v2 connector.
 *
 * Tempo ships this connector for wagmi v3 (`tempoWallet` in wagmi/connectors,
 * built on the `accounts` SDK). Gloam is on wagmi v2, so this is a port of
 * that connector (@wagmi/core 3.x src/tempo/Connectors.ts) onto wagmi v2's
 * createConnector, driving the same `accounts` Provider underneath.
 *
 * What it adds on top, so call sites stay unchanged:
 * - Fee sponsorship: the Provider is created with `feePayer`, so every
 *   transaction is sponsored by default (see lib/feeSponsor.ts).
 * - Gas sizing: call sites pass gas limits tuned for Robinhood Chain EOAs. On
 *   Tempo a passkey signature and a brand-new account cost more (TIP-1000:
 *   +250k gas for the first nonce, 250k per new storage slot), so a fresh
 *   account's approve needs ~550k, not 120k. Each send is re-estimated against
 *   the node for a passkey signer and padded 20%; a call site's larger limit
 *   still wins.
 * - Laziness: the SDK only loads once someone picks Tempo Wallet (or used it
 *   before on this device), so Robinhood-only visitors never download it.
 */

import { createConnector, ChainNotConfiguredError } from "wagmi";
import {
  numberToHex,
  SwitchChainError,
  UserRejectedRequestError,
  withRetry,
  type Address,
  type Client,
  type EIP1193RequestFn,
  type Hex,
  type RpcError,
} from "viem";
import { parseAccount } from "viem/utils";
import type { Provider as AccountsProvider } from "accounts";
import { TEMPO_CHAIN_ID, TEMPO_FEE_PAYER_URL, TEMPO_RPC_URL } from "./feeSponsor";

type Provider = ReturnType<typeof AccountsProvider.create>;

export const TEMPO_WALLET_ID = "xyz.tempo";
export const TEMPO_WALLET_NAME = "Tempo Wallet";

const USED_KEY = "gloam.tempoWallet";

const icon =
  'data:image/svg+xml,<svg width="269" height="269" viewBox="0 0 269 269" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="269" height="269" fill="black"/><path d="M123.273 190.794H93.445L121.09 105.318H85.7334L93.445 80.2642H191.95L184.238 105.318H150.773L123.273 190.794Z" fill="white"/></svg>' as const;

/** True for the Tempo Wallet connector (or a connection made through it). */
export function isTempoWallet(connector: { id?: string } | null | undefined): boolean {
  return connector?.id === TEMPO_WALLET_ID;
}

function wasUsed(): boolean {
  try {
    return window.localStorage.getItem(USED_KEY) === "1";
  } catch {
    return false;
  }
}

function markUsed(used: boolean) {
  try {
    if (used) window.localStorage.setItem(USED_KEY, "1");
    else window.localStorage.removeItem(USED_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Matches the wallet page to Gloam: neutral accent, current light/dark. */
function walletTheme() {
  const dark =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  return { accent: "neutral", scheme: dark ? "dark" : "light" } as const;
}

async function createProvider(): Promise<Provider> {
  const [{ Provider, tempoWallet }, { tempoModerato }, { http }] = await Promise.all([
    import("accounts"),
    import("viem/tempo/chains"),
    import("viem"),
  ]);
  return Provider.create({
    adapter: tempoWallet({ theme: walletTheme() }),
    chains: [tempoModerato],
    transports: { [tempoModerato.id]: http(TEMPO_RPC_URL) },
    ...(TEMPO_FEE_PAYER_URL ? { feePayer: TEMPO_FEE_PAYER_URL } : {}),
    testnet: true,
    // The SDK can patch window.fetch to auto-pay HTTP 402s; Gloam does not want that.
    mpp: false,
  });
}

/** One SDK Provider per page, shared by the connector and the preload below. */
let shared: Promise<Provider> | undefined;
function sharedProvider(): Promise<Provider> {
  shared ??= createProvider().catch((e) => {
    shared = undefined;
    throw e;
  });
  return shared;
}

/**
 * Warms the SDK while the passkey button is on screen. The wallet opens in a
 * popup where an iframe cannot be used (Safari, older browsers); a popup only
 * opens inside the click's user gesture, so the SDK must already be loaded.
 */
export function preloadTempoWallet() {
  if (typeof window === "undefined") return;
  void sharedProvider().catch(() => {});
}

const SEND_METHODS = new Set([
  "eth_sendTransaction",
  "eth_sendTransactionSync",
  "wallet_sendTransaction",
]);

/** Node estimate for a passkey signer, padded 20%; never below the call site's limit. */
async function sizeGas(
  request: EIP1193RequestFn,
  tx: Record<string, unknown>,
  hint: unknown
): Promise<Hex | undefined> {
  try {
    const { feePayer: _feePayer, ...call } = tx;
    void _feePayer;
    const estimate = BigInt(
      (await request({
        method: "eth_estimateGas",
        params: [{ ...call, keyType: "webAuthn" }],
      } as never)) as Hex
    );
    const padded = estimate + estimate / 5n;
    const floor = typeof hint === "string" || typeof hint === "bigint" ? BigInt(hint) : 0n;
    return numberToHex(padded > floor ? padded : floor);
  } catch {
    // Could not estimate (e.g. it would revert): let the wallet size it.
    return undefined;
  }
}

function withSizedGas(request: EIP1193RequestFn): EIP1193RequestFn {
  return (async (args: { method: string; params?: unknown }, options?: unknown) => {
    const params = args.params;
    if (
      !SEND_METHODS.has(args.method) ||
      !Array.isArray(params) ||
      !params[0] ||
      typeof params[0] !== "object"
    ) {
      return request(args as never, options as never);
    }
    const { gas: hint, ...tx } = params[0] as Record<string, unknown>;
    const gas = await sizeGas(request, tx, hint);
    return request(
      { ...args, params: [gas ? { ...tx, gas } : tx, ...params.slice(1)] } as never,
      options as never
    );
  }) as EIP1193RequestFn;
}

/** wagmi connector for Tempo Wallet: passkey accounts, Tempo only, fees sponsored. */
export function tempoWalletConnector() {
  return createConnector<Provider>((config) => {
    // Set once this connector has touched the SDK (connect, reconnect, setup).
    let providerPromise: Promise<Provider> | undefined;
    let accountsChanged: ((accounts: string[]) => void) | undefined;
    let chainChanged: ((chain: string) => void) | undefined;
    let connect: ((info: { chainId: string }) => void) | undefined;
    let disconnect: ((error?: Error) => void) | undefined;

    function getProvider(): Promise<Provider> {
      providerPromise ??= sharedProvider().catch((e) => {
        providerPromise = undefined;
        throw e;
      });
      return providerPromise;
    }

    function listen(provider: Provider, self: {
      onAccountsChanged: (a: string[]) => void;
      onChainChanged: (c: string) => void;
      onDisconnect: (e?: Error) => void;
    }) {
      if (connect) {
        provider.removeListener("connect", connect as never);
        connect = undefined;
      }
      if (!accountsChanged) {
        accountsChanged = self.onAccountsChanged.bind(self);
        provider.on("accountsChanged", accountsChanged as never);
      }
      if (!chainChanged) {
        chainChanged = self.onChainChanged.bind(self);
        provider.on("chainChanged", chainChanged as never);
      }
      if (!disconnect) {
        disconnect = self.onDisconnect.bind(self);
        provider.on("disconnect", disconnect as never);
      }
    }

    return {
      icon,
      id: TEMPO_WALLET_ID,
      name: TEMPO_WALLET_NAME,
      rdns: TEMPO_WALLET_ID,
      type: "tempoWallet",

      async connect({ chainId, isReconnecting } = {}) {
        let accounts: readonly Address[] = [];
        if (isReconnecting) {
          accounts = await this.getAccounts().catch(() => []);
        }
        try {
          const provider = await getProvider();
          if (!accounts.length && !isReconnecting) {
            const response = (await provider.request({
              method: "wallet_connect",
              params: [{ ...(chainId ? { chainId } : {}) }],
            } as never)) as { accounts: readonly { address: Address }[] };
            accounts = response.accounts.map((a) => a.address);
          }
          const currentChainId = await this.getChainId();
          if (!currentChainId) throw new ChainNotConfiguredError();
          listen(provider, this);
          markUsed(true);
          return { accounts, chainId: currentChainId };
        } catch (error) {
          const rpcError = error as RpcError;
          if (rpcError.code === UserRejectedRequestError.code) {
            throw new UserRejectedRequestError(rpcError);
          }
          throw rpcError;
        }
      },

      async disconnect() {
        markUsed(false);
        if (!providerPromise) return;
        const provider = await providerPromise;
        if (chainChanged) {
          provider.removeListener("chainChanged", chainChanged as never);
          chainChanged = undefined;
        }
        if (disconnect) {
          provider.removeListener("disconnect", disconnect as never);
          disconnect = undefined;
        }
        if (!connect) {
          connect = this.onConnect?.bind(this);
          if (connect) provider.on("connect", connect as never);
        }
        await provider.request({ method: "wallet_disconnect" } as never).catch(() => {});
      },

      async getAccounts() {
        const provider = await getProvider();
        return (await provider.request({ method: "eth_accounts" })) as readonly Address[];
      },

      async getChainId() {
        const provider = await getProvider();
        return Number(await provider.request({ method: "eth_chainId" }));
      },

      async getClient({ chainId } = {}) {
        const provider = await getProvider();
        // A JSON-RPC account: the SDK signs (and sponsors) inside the wallet.
        const { address } = provider.getAccount();
        const base = provider.getClient({ chainId });
        return Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
          account: parseAccount(address),
          request: withSizedGas(base.request as EIP1193RequestFn),
        }) as Client;
      },

      async getProvider() {
        // Only load the SDK for someone who picked Tempo Wallet. wagmi's
        // reconnect probes every connector; a rejection here just skips us.
        if (!providerPromise && !wasUsed()) {
          throw new Error("Tempo Wallet has not been used on this device.");
        }
        return getProvider();
      },

      async isAuthorized() {
        if (!providerPromise && !wasUsed()) return false;
        try {
          const accounts = await withRetry(() => this.getAccounts());
          return accounts.length > 0;
        } catch {
          return false;
        }
      },

      async setup() {
        if (!wasUsed()) return;
        const provider = await getProvider().catch(() => undefined);
        if (provider && !connect) {
          connect = this.onConnect?.bind(this);
          if (connect) provider.on("connect", connect as never);
        }
      },

      async switchChain({ chainId }) {
        const chain = config.chains.find((c) => c.id === chainId);
        // Tempo Wallet accounts live on Tempo only.
        if (!chain || chainId !== TEMPO_CHAIN_ID) {
          throw new SwitchChainError(new ChainNotConfiguredError());
        }
        const provider = await getProvider();
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(chainId) }],
        } as never);
        return chain;
      },

      onAccountsChanged(accounts) {
        if (accounts.length === 0) {
          markUsed(false);
          config.emitter.emit("disconnect");
        } else config.emitter.emit("change", { accounts: accounts as readonly Address[] });
      },

      onChainChanged(chain) {
        config.emitter.emit("change", { chainId: Number(chain) });
      },

      async onConnect(info) {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) return;
        config.emitter.emit("connect", { accounts, chainId: Number(info.chainId) });
        const provider = await getProvider();
        listen(provider, this);
      },

      async onDisconnect() {
        markUsed(false);
        config.emitter.emit("disconnect");
        if (!providerPromise) return;
        const provider = await providerPromise;
        if (chainChanged) {
          provider.removeListener("chainChanged", chainChanged as never);
          chainChanged = undefined;
        }
        if (disconnect) {
          provider.removeListener("disconnect", disconnect as never);
          disconnect = undefined;
        }
        if (!connect) {
          connect = this.onConnect?.bind(this);
          if (connect) provider.on("connect", connect as never);
        }
      },
    };
  });
}
