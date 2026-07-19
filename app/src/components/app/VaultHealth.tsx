"use client";

import { useCallback, useEffect, useState } from "react";
import { shortAddress } from "@/lib/chain";
import {
  SHIELD_POOL_ADDRESS,
  HASH_SCHEME,
  isShieldDeployed,
} from "@/lib/shield";
import { readVaultSealedReadiness } from "@/lib/vaultStatus";
import { useShieldTree } from "@/hooks/useShieldTree";
import { StatusPill } from "./StatusPill";

/**
 * Always-on vault status — dedicated RH RPC, no wallet required.
 */
export function VaultHealth({ compact = false }: { compact?: boolean }) {
  const { leafCount, loading: treeLoading, refresh, error: treeError } =
    useShieldTree();
  const [sealed, setSealed] = useState<"checking" | "ready" | "off">("checking");

  const check = useCallback(async () => {
    if (!isShieldDeployed()) {
      setSealed("off");
      return;
    }
    const r = await readVaultSealedReadiness();
    setSealed(r.status === "ready" ? "ready" : "off");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (!isShieldDeployed()) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-mute">
        <span>
          Vault {HASH_SCHEME}
          {SHIELD_POOL_ADDRESS
            ? ` · ${shortAddress(SHIELD_POOL_ADDRESS, 4)}`
            : ""}
          {treeLoading
            ? " · syncing…"
            : treeError
              ? " · tree error"
              : ` · ${leafCount} notes`}
        </span>
        <span className="flex items-center gap-2">
          <StatusPill tone={sealed === "ready" ? "lime" : "mute"} dot>
            {sealed === "ready" ? "Private trade" : "Vault"}
          </StatusPill>
          <button
            type="button"
            onClick={() => {
              void check();
              void refresh();
            }}
            className="text-lime hover:underline"
          >
            Refresh
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            Privacy vault
          </p>
          <p className="mt-1 text-mute">
            {SHIELD_POOL_ADDRESS
              ? shortAddress(SHIELD_POOL_ADDRESS, 6)
              : "not configured"}{" "}
            · {HASH_SCHEME}
            {treeLoading
              ? " · syncing tree…"
              : treeError
                ? " · tree error"
                : ` · ${leafCount} notes on chain`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={sealed === "ready" ? "lime" : "warn"} dot>
            {sealed === "ready" ? "Sealed ready" : sealed === "checking" ? "…" : "Limited"}
          </StatusPill>
          <button
            type="button"
            onClick={() => {
              void check();
              void refresh();
            }}
            className="text-xs text-lime hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-mute">
        Stay in the vault for privacy. Shield, private send, and private trade
        keep size off the public book. Cash out publishes amount by design.
      </p>
    </div>
  );
}
