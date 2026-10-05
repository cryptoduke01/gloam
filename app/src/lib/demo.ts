"use client";

/*
 * Recording demo (switch in lib/demoFlag.ts). The hooks views use in place of
 * wagmi's, so the pretend wallet in lib/demo/store shows up and its transactions play
 * out through each view's own progress states. Outside a demo every hook here
 * is exactly the wagmi hook it wraps.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { zeroAddress, type Address, type Hex, type Log } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
  type ResolvedRegister,
  type UseSendTransactionReturnType,
  type UseWriteContractReturnType,
} from "wagmi";
import { useNetwork } from "@/components/app/NetworkProvider";
import type { ActivityTx } from "@/hooks/useActivity";
import { erc20Abi } from "@/lib/dex";
import { readDemo } from "@/lib/demoFlag";
import type { GloamChainId } from "@/lib/networks";
import {
  DEMO_ADDRESS,
  DEMO_MS,
  demoActivity,
  demoTxStatus,
  demoVersion,
  demoWalletBalance,
  demoWriteEffect,
  jitter,
  sleep,
  submitDemoTx,
  subscribeDemo,
} from "./demo/store";

export { exitDemo, readDemo } from "@/lib/demoFlag";
export { DEMO_ADDRESS } from "./demo/store";
export { demoHistory, simulatePayroll } from "./demo/payroll";

const noSubscribe = () => () => {};
const noVersion = () => 0;
const resolved = () => Promise.resolve();

/** Off on the server and in the first paint, then the tab's real setting. */
export function useDemo(): boolean {
  return useSyncExternalStore(noSubscribe, readDemo, () => false);
}

/** Re-renders whenever the pretend wallet changes; returns its version. */
function useDemoStore(): number {
  return useSyncExternalStore(subscribeDemo, demoVersion, noVersion);
}

/** useDemo, also re-rendering the caller whenever the pretend wallet changes. */
export function useDemoLive(): boolean {
  const demo = useDemo();
  useDemoStore();
  return demo;
}

/** wagmi's account and chain, with the pretend wallet swapped in during a demo. */
export function useAppAccount() {
  const demo = useDemo();
  const account = useAccount();
  const walletChainId = useChainId();
  const { network } = useNetwork();
  if (!demo) return { ...account, chainId: walletChainId, demo };
  return {
    ...account,
    address: DEMO_ADDRESS,
    isConnected: true,
    isConnecting: false,
    chainId: network.chainId,
    demo,
  };
}

// ------------------------------------------------------------------ balances

type Query = { address?: Address; chainId: GloamChainId; enabled?: boolean };

/** wagmi's useBalance (native coin), reading the pretend wallet during a demo. */
export function useAppBalance(q: Query): {
  data: { value: bigint } | undefined;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const demo = useDemo();
  useDemoStore();
  const real = useBalance({
    address: q.address,
    chainId: q.chainId,
    query: { enabled: (q.enabled ?? true) && !demo },
  });
  if (!demo) return { data: real.data, isLoading: real.isLoading, refetch: real.refetch };
  return { data: { value: demoWalletBalance(q.chainId, zeroAddress) }, isLoading: false, refetch: resolved };
}

/** An ERC-20 balanceOf read, reading the pretend wallet during a demo. */
export function useAppTokenBalance(q: Query & { token?: Address }): {
  data: bigint | undefined;
  refetch: () => Promise<unknown>;
} {
  const demo = useDemo();
  useDemoStore();
  const real = useReadContract({
    address: q.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: q.address ? [q.address] : undefined,
    chainId: q.chainId,
    query: { enabled: Boolean(q.address) && (q.enabled ?? true) && !demo },
  });
  if (!demo) return { data: real.data, refetch: real.refetch };
  return { data: q.token ? demoWalletBalance(q.chainId, q.token) : undefined, refetch: resolved };
}

/** balanceOf for several tokens at once (undefined until read), from the pretend wallet during a demo. */
export function useAppTokenBalances(q: Query & { tokens: Address[] }): (bigint | undefined)[] {
  const demo = useDemo();
  const version = useDemoStore();
  const { data } = useReadContracts({
    contracts: q.tokens.map((token) => ({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [q.address ?? zeroAddress] as const,
      chainId: q.chainId,
    })),
    query: { enabled: Boolean(q.address) && (q.enabled ?? true) && !demo },
  });
  const { tokens, chainId } = q;
  return useMemo(() => {
    if (demo) return tokens.map((token) => demoWalletBalance(chainId, token));
    return tokens.map((_, i) => {
      const r = data?.[i];
      return r?.status === "success" ? (r.result as bigint) : undefined;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: the pretend wallet changed
  }, [demo, data, tokens, chainId, version]);
}

// ------------------------------------------------------------------ transactions

type DemoCall = { address: Address; functionName?: string; args?: readonly unknown[]; value?: bigint; chainId?: number };

/** The pretend wallet signing: a beat to "confirm", then the call goes to the pretend chain. */
function useDemoSigner() {
  const { network } = useNetwork();
  const [state, setState] = useState<{ hash?: Hex; pending: boolean }>({ pending: false });
  const run = useRef(0);
  const sign = useCallback(
    (call: DemoCall) => {
      const id = ++run.current;
      setState({ pending: true });
      void sleep(jitter(DEMO_MS.wallet)).then(() => {
        if (run.current !== id) return;
        const hash = submitDemoTx(call.chainId ?? network.chainId, demoWriteEffect({ ...call, to: call.address }));
        setState({ pending: false, hash });
      });
    },
    [network.chainId]
  );
  const reset = useCallback(() => {
    run.current++;
    setState({ pending: false });
  }, []);
  return { ...state, sign, reset };
}

type WriteContract = UseWriteContractReturnType<ResolvedRegister["config"]>["writeContract"];
type SendTransaction = UseSendTransactionReturnType<ResolvedRegister["config"]>["sendTransaction"];

type AppWrite<F> = { data: Hex | undefined; isPending: boolean; error: Error | null; reset: () => void } & F;

/**
 * wagmi's useWriteContract. During a demo the wallet signs after a beat and the
 * pretend chain applies the call (a deposit leaves the public balance, a cash
 * out comes back to it).
 */
export function useAppWriteContract(): AppWrite<{ writeContract: WriteContract }> {
  const demo = useDemo();
  const real = useWriteContract();
  const signer = useDemoSigner();
  const { sign } = signer;
  const writeContract = useCallback<WriteContract>(
    (args) => sign(args as unknown as DemoCall),
    [sign]
  );
  if (!demo) {
    return { writeContract: real.writeContract, data: real.data, isPending: real.isPending, error: real.error, reset: real.reset };
  }
  return { writeContract, data: signer.hash, isPending: signer.pending, error: null, reset: signer.reset };
}

/** wagmi's useSendTransaction, with the same demo playback as useAppWriteContract. */
export function useAppSendTransaction(): AppWrite<{ sendTransaction: SendTransaction }> {
  const demo = useDemo();
  const real = useSendTransaction();
  const signer = useDemoSigner();
  const { sign } = signer;
  const sendTransaction = useCallback<SendTransaction>(
    (args) => {
      const tx = args as unknown as { to: Address; value?: bigint; chainId?: number };
      sign({ address: tx.to, value: tx.value, chainId: tx.chainId });
    },
    [sign]
  );
  if (!demo) {
    return { sendTransaction: real.sendTransaction, data: real.data, isPending: real.isPending, error: real.error, reset: real.reset };
  }
  return { sendTransaction, data: signer.hash, isPending: signer.pending, error: null, reset: signer.reset };
}

const DEMO_RECEIPT: { logs: Log[] } = { logs: [] };

/** wagmi's useWaitForTransactionReceipt, following the pretend chain during a demo. */
export function useAppTxReceipt(q: { hash?: Hex; chainId: GloamChainId }): {
  isLoading: boolean;
  isSuccess: boolean;
  data: { logs: Log[] } | undefined;
} {
  const demo = useDemo();
  useDemoStore();
  const real = useWaitForTransactionReceipt({ hash: demo ? undefined : q.hash, chainId: q.chainId });
  if (!demo) return { isLoading: real.isLoading, isSuccess: real.isSuccess, data: real.data };
  const status = q.hash ? demoTxStatus(q.hash) : undefined;
  return {
    isLoading: status === "pending",
    isSuccess: status === "confirmed",
    data: status === "confirmed" ? DEMO_RECEIPT : undefined,
  };
}

// ------------------------------------------------------------------ activity

/** The pretend wallet's public history, in useActivity's shape; null outside a demo. */
export function useDemoActivity(): { data: { txs: ActivityTx[] }; isLoading: boolean; isError: boolean } | null {
  const demo = useDemo();
  const { network } = useNetwork();
  useDemoStore();
  return demo ? { data: { txs: demoActivity(network.chainId) }, isLoading: false, isError: false } : null;
}
