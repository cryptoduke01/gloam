"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import {
  confirmedNotes,
  fetchChainShieldNotes,
  loadLocalNotes,
  mergeNotes,
  sumByAsset,
  sumEthWei,
  type LocalNote,
} from "@/lib/shield";

/**
 * Local notes + on-chain Shielded events for the connected address.
 * Chain sync means a new browser still sees deposit history (public edges).
 */
export function useLocalShieldNotes(address?: string | null) {
  const publicClient = usePublicClient({ chainId: PRODUCT_CHAIN_ID });
  const [local, setLocal] = useState<LocalNote[]>([]);
  const [chain, setChain] = useState<LocalNote[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refreshLocal = useCallback(() => {
    setLocal(loadLocalNotes(address));
    setReady(true);
  }, [address]);

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
    } finally {
      setSyncing(false);
    }
  }, [publicClient, address]);

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
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshLocal, refresh]);

  const notes = useMemo(() => mergeNotes(local, chain), [local, chain]);
  const open = useMemo(() => confirmedNotes(notes), [notes]);
  const shieldedWei = useMemo(() => sumEthWei(notes), [notes]);
  const byAsset = useMemo(() => sumByAsset(notes), [notes]);

  return {
    notes,
    open,
    shieldedWei,
    byAsset,
    ready,
    syncing,
    refresh,
  };
}
