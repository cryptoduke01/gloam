"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assertTreeMatchesChain,
  syncShieldTree,
  type SyncedTree,
} from "@/lib/treeSync";
import { getRhPublicClient } from "@/lib/rhClient";
import { isShieldDeployed } from "@/lib/shield";
import type { MerklePath } from "@/lib/merkle";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";

/**
 * Vault Merkle tree — uses dedicated RH RPC (not wallet network).
 */
export function useShieldTree() {
  const [synced, setSynced] = useState<SyncedTree | null>(null);
  const [matchesChain, setMatchesChain] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isShieldDeployed()) {
      setSynced(null);
      setMatchesChain(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const publicClient = getRhPublicClient();
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pathForLeaf(
    leafIndex: number
  ): Promise<MerklePath | PoseidonMerklePath | null> {
    if (!synced) return null;
    return synced.pathForLeaf(leafIndex);
  }

  function leafIndexForCommitment(commitment?: string | null): number | null {
    if (!synced || !commitment) return null;
    const i = synced.indexByCommitment.get(commitment.toLowerCase());
    return i === undefined ? null : i;
  }

  return {
    synced,
    matchesChain,
    loading,
    error,
    refresh,
    pathForLeaf,
    leafIndexForCommitment,
    leafCount: synced?.leafCount ?? 0,
    root: synced?.root ?? null,
    scheme: synced?.scheme ?? null,
  };
}
