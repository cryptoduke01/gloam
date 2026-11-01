"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  assertTreeMatchesChain,
  shownTree,
  syncShieldTree,
  type SyncedTree,
} from "@/lib/treeSync";
import { publicClientFor } from "@/lib/rhClient";
import { useNetwork } from "@/components/app/NetworkProvider";
import { isShieldDeployed } from "@/lib/shield";
import type { MerklePath } from "@/lib/merkle";
import type { PoseidonMerklePath } from "@/lib/merklePoseidon";

/**
 * Vault Merkle tree of the network the page shows, read over that network's
 * own RPC (not the wallet's). Synced again on every network switch, and a tree
 * of another chain is never handed out: the vaults share one address, so a
 * path from it would prove a note of that chain while the page shows this one.
 */
export function useShieldTree() {
  const { network, settled } = useNetwork();
  const [stored, setSynced] = useState<SyncedTree | null>(null);
  const synced = shownTree(stored, network);
  const [matchesChain, setMatchesChain] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a failed sync tries again by itself a few times (1 s, 3 s, 9 s, with jitter)
  const retries = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const latestRefresh = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  // a sync that started before a network switch must not replace the new network's tree
  const shownKey = useRef(network.key);
  useEffect(() => {
    shownKey.current = network.key;
  }, [network.key]);

  const refresh = useCallback(async (auto = false) => {
    if (!auto) retries.current = 0;
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (!isShieldDeployed()) {
      setSynced(null);
      setMatchesChain(null);
      return;
    }
    // the network isn't known yet on the first render: nothing to read
    if (!settled) return;
    setLoading(true);
    setError(null);
    const key = network.key;
    try {
      const publicClient = publicClientFor(network);
      const tree = await syncShieldTree(publicClient, network);
      if (shownKey.current !== key) return;
      setSynced(tree);
      if (tree) {
        // The sync already matched the root to the pool at the synced block.
        const ok = tree.verified || (await assertTreeMatchesChain(publicClient, tree));
        if (shownKey.current !== key) return;
        setMatchesChain(ok);
        if (!ok) {
          setError("Rebuilt tree root does not match pool.currentRoot()");
        }
      }
    } catch (e) {
      if (shownKey.current !== key) return;
      setError(e instanceof Error ? e.message : "Tree sync failed");
      setSynced(null);
      setMatchesChain(null);
      if (retries.current < 3) {
        const wait = 1_000 * 3 ** retries.current + Math.random() * 500;
        retries.current++;
        retryTimer.current = window.setTimeout(() => void latestRefresh.current(true), wait);
      }
    } finally {
      if (shownKey.current === key) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.key, settled]);

  useEffect(() => {
    latestRefresh.current = refresh;
  }, [refresh]);

  useEffect(() => {
    // Start on the next microtask so the effect body itself sets no state.
    void Promise.resolve().then(() => refresh());
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
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
    // the root check of a tree this network no longer shows says nothing about this one
    matchesChain: synced ? matchesChain : null,
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
