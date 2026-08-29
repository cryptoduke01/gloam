"use client";

import { useEffect, useMemo, useState } from "react";
import { EXPLORER_ADDRESS, shortAddress } from "@/lib/chain";
import { vaultEnvDiagnostics } from "@/lib/config";
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
  const env = useMemo(() => vaultEnvDiagnostics(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isShieldDeployed()) {
        if (!cancelled) setSealed("off");
        return;
      }
      const r = await readVaultSealedReadiness();
      if (!cancelled) setSealed(r.status === "ready" ? "ready" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isShieldDeployed()) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-mute">
        <span>
          Privacy vault
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
              void (async () => {
                const r = await readVaultSealedReadiness();
                setSealed(r.status === "ready" ? "ready" : "off");
                await refresh();
              })();
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
          <p className="text-[10px] uppercase tracking-[0.14em] text-lime">
            Privacy vault
          </p>
          <p className="mt-1 text-mute">
            {SHIELD_POOL_ADDRESS
              ? shortAddress(SHIELD_POOL_ADDRESS, 6)
              : "not configured"}
            {HASH_SCHEME !== "poseidon" ? ` · ${HASH_SCHEME}` : ""}
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
              void (async () => {
                const r = await readVaultSealedReadiness();
                setSealed(r.status === "ready" ? "ready" : "off");
                await refresh();
              })();
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
      {SHIELD_POOL_ADDRESS && (
        <p className="mt-2 break-all text-[10px] text-mute">
          {SHIELD_POOL_ADDRESS}
          {" · block "}
          {env.deployBlock.toString()}
          {env.remappedFromLegacy || env.deployBlockRemapped
            ? " · remapped from legacy env"
            : ""}
          {" · "}
          <a
            href={EXPLORER_ADDRESS(SHIELD_POOL_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="text-lime hover:underline"
          >
            explorer
          </a>
        </p>
      )}
      {(env.remappedFromLegacy || env.deployBlockRemapped) && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
          Vercel still has pre-sealed env values. App remaps to sealed vault{" "}
          {shortAddress(env.productPool, 4)} — clean{" "}
          <code className="text-foreground">NEXT_PUBLIC_POSEIDON_SHIELD_POOL</code>{" "}
          and deploy block in Vercel when you can.
        </p>
      )}
    </div>
  );
}
