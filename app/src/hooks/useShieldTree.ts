"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { PRODUCT_CHAIN_ID } from "@/lib/chain";
import {
  assertTreeMatchesChain,
  syncShieldTree,
  type SyncedTree,
} from "@/lib/treeSync";
import type { MerklePath } from "@/lib/merkle";
import { isShieldDeployed } from "@/lib/shield";

export function useShieldTree() {
  const publicClient = usePublicClient({ chainId: PRODUCT_CHAIN_ID });
  const [synced, setSynced] = useState<SyncedTree | null>(null);
  const [matchesChain, setMatchesChain] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient || !isShieldDeployed()) {
      setSynced(null);
      setMatchesChain(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tree = await syncShieldTree(publicClient);
      setSynced(tree);
      if (tree) {
        const ok = await assertTreeMatchesChain(publicClient, tree);
        setMatchesChain(ok);
        if (!ok) {
          setError("Rebuilt tree root does not match pool.currentRoot()");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tree sync failed");
      setSynced(null);
      setMatchesChain(null);
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function pathForLeaf(leafIndex: number): MerklePath | null {
    if (!synced) return null;
    try {
      return synced.tree.path(leafIndex);
    } catch {
      return null;
    }
  }

  return {
    synced,
    matchesChain,
    loading,
    error,
    refresh,
    pathForLeaf,
    leafCount: synced?.leafCount ?? 0,
    root: synced?.root ?? null,
  };
}
