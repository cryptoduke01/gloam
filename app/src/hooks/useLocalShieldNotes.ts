"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { getRhPublicClient } from "@/lib/rhClient";
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
 *
 * Uses dedicated RH RPC, not the wallet network.
 */
export function useLocalShieldNotes(address?: string | null) {
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
      if (!SHIELD_POOL_ADDRESS) return;
      const publicClient = getRhPublicClient();
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
    [address]
  );

  const syncChain = useCallback(async () => {
    if (!address || !SHIELD_POOL_ADDRESS) {
      setChain([]);
      return;
    }
    setSyncing(true);
    try {
      const publicClient = getRhPublicClient();
      const rows = await fetchChainShieldNotes(
        publicClient,
        address as Address
      );
      setChain(rows);
      const merged = mergeNotes(loadLocalNotes(address), rows);
      await reconcileSpent(merged);
      // Ghost-note cleanup: only wipe local ETH if pool ETH inventory is zero
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
    } finally {
      setSyncing(false);
    }
  }, [address, reconcileSpent]);

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
  }, [refresh, refreshLocal]);

  const merged = useMemo(
    () => mergeNotes(local, chain),
    [local, chain]
  );
  const open = useMemo(
    () => activeSpendableNotes(merged),
    [merged]
  );
  const confirmed = useMemo(() => confirmedNotes(merged), [merged]);
  const byAsset = useMemo(() => sumByAsset(open), [open]);
  const shieldedWei = useMemo(() => sumEthWei(open), [open]);

  return {
    local,
    chain,
    merged,
    open,
    confirmed,
    byAsset,
    shieldedWei,
    ready,
    syncing,
    refresh,
    refreshLocal,
  };
}
