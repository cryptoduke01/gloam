"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address, Hex } from "viem";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import {
  SHIELD_POOL_ADDRESS,
  activeSpendableNotes,
  confirmedNotes,
  fetchChainShieldNotes,
  loadLocalNotes,
  markNoteRecovered,
  mergeNotes,
  purgeSenderPaymentNotes,
  shieldPoolAbi,
  sumByAsset,
  sumEthWei,
  type LocalNote,
} from "@/lib/shield";

/**
 * Local notes + chain history. Balance only counts notes with a local secret
 * that are not spent on-chain.
 */
export function useLocalShieldNotes(address?: string | null) {
  const publicClient = usePublicClient({ chainId: PRODUCT_CHAIN_ID });
  const [local, setLocal] = useState<LocalNote[]>([]);
  const [chain, setChain] = useState<LocalNote[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const lastFocusSync = useRef(0);

  const refreshLocal = useCallback(() => {
    purgeSenderPaymentNotes();
    setLocal(loadLocalNotes(address));
    setReady(true);
  }, [address]);

  const reconcileSpent = useCallback(
    async (notes: LocalNote[]) => {
      if (!publicClient || !SHIELD_POOL_ADDRESS) return;
      const candidates = notes.filter(
        (n) =>
          n.nullifier &&
          n.nullifier !== "0x" &&
          n.status !== "recovered" &&
          n.secret &&
          n.secret !== "0x"
      );
      let any = false;
      for (const n of candidates) {
        try {
          const spent = (await publicClient.readContract({
            address: SHIELD_POOL_ADDRESS,
            abi: shieldPoolAbi,
            functionName: "isSpent",
            args: [n.nullifier as Hex],
          })) as boolean;
          if (spent) {
            markNoteRecovered(n.id);
            any = true;
          }
        } catch {
          /* ignore */
        }
      }
      if (any) {
        setLocal(loadLocalNotes(address));
      }
    },
    [publicClient, address]
  );

  const syncChain = useCallback(async () => {
    if (!publicClient || !address) {
      setChain([]);
      return;
    }
    setSyncing(true);
    try {
      const rows = await fetchChainShieldNotes(
        publicClient,
        address as Address
      );
      setChain(rows);
      const merged = mergeNotes(loadLocalNotes(address), rows);
      await reconcileSpent(merged);
      // If vault holds 0 ETH, clear stale local ETH notes (ghost balances)
      if (SHIELD_POOL_ADDRESS) {
        try {
          const ethInPool = (await publicClient.readContract({
            address: SHIELD_POOL_ADDRESS,
            abi: shieldPoolAbi,
            functionName: "deposited",
            args: ["0x0000000000000000000000000000000000000000"],
          })) as bigint;
          if (ethInPool === BigInt(0)) {
            const locals = loadLocalNotes(address);
            for (const n of locals) {
              if (
                n.status !== "recovered" &&
                (!n.asset ||
                  n.asset === "0x0000000000000000000000000000000000000000")
              ) {
                markNoteRecovered(n.id);
              }
            }
            setLocal(loadLocalNotes(address));
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [publicClient, address, reconcileSpent]);

  const refresh = useCallback(() => {
    refreshLocal();
    void syncChain();
  }, [refreshLocal, syncChain]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    void syncChain();
  }, [syncChain]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gloam.shield.notes.v1") refreshLocal();
    };
    const onFocus = () => {
      const now = Date.now();
      // Debounce focus re-sync (RPC / log load can be heavy)
      if (now - lastFocusSync.current < 15_000) {
        refreshLocal();
        return;
      }
      lastFocusSync.current = now;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshLocal, refresh]);

  const notes = useMemo(() => mergeNotes(local, chain), [local, chain]);
  /** Spendable vault notes (have secret, not recovered/spent) */
  const open = useMemo(() => activeSpendableNotes(notes), [notes]);
  /** Deposit history including chain-only rows */
  const history = useMemo(() => confirmedNotes(notes), [notes]);
  const shieldedWei = useMemo(() => sumEthWei(notes), [notes]);
  const byAsset = useMemo(() => sumByAsset(notes), [notes]);

  return {
    notes,
    open,
    history,
    shieldedWei,
    byAsset,
    ready,
    syncing,
    refresh,
  };
}
