"use client";

import { createConnector } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  http,
  numberToHex,
  type Address,
  type EIP1193Provider,
} from "viem";
import { robinhoodTestnet } from "./chain";
import { getActiveTurnkeyAccount } from "./turnkeyBridge";

const RPC = robinhoodTestnet.rpcUrls.default.http[0];

/** Minimal EIP-1193 provider that signs with the Turnkey embedded wallet. */
function makeProvider(): EIP1193Provider {
  const publicClient = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(RPC),
  });

  async function request({ method, params }: { method: string; params?: unknown[] }) {
    const account = getActiveTurnkeyAccount();

    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return account ? [account.address] : [];
      case "eth_chainId":
        return numberToHex(robinhoodTestnet.id);
      case "net_version":
        return String(robinhoodTestnet.id);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "personal_sign": {
        if (!account) throw new Error("Sign in with a passkey first.");
        const data = (params?.[0] as `0x${string}`) ?? "0x";
        return account.signMessage({ message: { raw: data } });
      }
      case "eth_signTypedData_v4": {
        if (!account) throw new Error("Sign in with a passkey first.");
        const raw = params?.[1];
        const typed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return account.signTypedData(typed);
      }
      case "eth_sendTransaction": {
        if (!account) throw new Error("Sign in with a passkey first.");
        const tx = (params?.[0] ?? {}) as {
          to?: Address;
          data?: `0x${string}`;
          value?: `0x${string}`;
          gas?: `0x${string}`;
        };
        const walletClient = createWalletClient({
          account,
          chain: robinhoodTestnet,
          transport: http(RPC),
        });
        return walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      default:
        // Forward all reads (eth_call, eth_getBalance, estimateGas, receipts…)
        return publicClient.request({
          method: method as never,
          params: params as never,
        });
    }
  }

  return {
    request,
    on: () => {},
    removeListener: () => {},
  } as unknown as EIP1193Provider;
}

/** wagmi connector for the Gloam passkey (Turnkey embedded) wallet. */
export function turnkeyConnector() {
  let provider: EIP1193Provider | undefined;

  return createConnector((config) => ({
    id: "gloam-turnkey",
    name: "Gloam Passkey",
    type: "turnkey" as const,

    async connect() {
      const account = getActiveTurnkeyAccount();
      if (!account) throw new Error("Sign in with a passkey first.");
      return {
        accounts: [account.address] as readonly Address[],
        chainId: robinhoodTestnet.id,
      };
    },
    async disconnect() {
      config.emitter.emit("disconnect");
    },
    async getAccounts() {
      const account = getActiveTurnkeyAccount();
      return (account ? [account.address] : []) as readonly Address[];
    },
    async getChainId() {
      return robinhoodTestnet.id;
    },
    async getProvider() {
      if (!provider) provider = makeProvider();
      return provider;
    },
    async isAuthorized() {
      return Boolean(getActiveTurnkeyAccount());
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
