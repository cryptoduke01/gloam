"use client";

/**
 * The TIP-403 issuer policy of the stablecoin on screen, for the "what the
 * explorer shows" card. Public chain data via /api/screen/policy; no wallet
 * address leaves the browser. Null on other chains, for non-TIP-20 assets, and
 * while loading or if the chain does not answer.
 */
import { useEffect, useState } from "react";
import { isTip20Address, isTip403Chain, type Tip403AssetStatus } from "./tip403";

export type Tip403PolicyView = {
  status: Tip403AssetStatus;
  notices: { deposit: string | null; cashout: string | null };
};

const cache = new Map<string, { at: number; view: Tip403PolicyView | null }>();
const TTL_MS = 30_000;

export function useTip403Policy(chainId: number, asset: string | null | undefined): Tip403PolicyView | null {
  const applies = isTip403Chain(chainId) && isTip20Address(asset);
  const key = applies ? `${chainId}:${String(asset).toLowerCase()}` : "";
  const [state, setState] = useState<{ key: string; view: Tip403PolicyView | null }>({ key: "", view: null });

  useEffect(() => {
    if (!key) return;
    let live = true;
    const hit = cache.get(key);
    const [id, token] = key.split(":");
    const load: Promise<Tip403PolicyView | null> =
      hit && Date.now() - hit.at < TTL_MS
        ? Promise.resolve(hit.view)
        : fetch(`/api/screen/policy?chainId=${id}&asset=${token}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((j: { applies?: boolean; status?: Tip403AssetStatus | null; notices?: Tip403PolicyView["notices"] }) => {
              const view = j.applies && j.status && j.notices ? { status: j.status, notices: j.notices } : null;
              cache.set(key, { at: Date.now(), view });
              return view;
            });
    load
      .then((view) => {
        if (live) setState({ key, view });
      })
      .catch(() => {
        /* best effort: the card just leaves the row out */
      });
    return () => {
      live = false;
    };
  }, [key]);

  return key && state.key === key ? state.view : null;
}
