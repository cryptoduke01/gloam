"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AuthState, ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import { embeddedNeedsWallet, onEmbeddedNeedsWallet, openEmbeddedSheet } from "@/lib/turnkeyBridge";

/**
 * Email or passkey sign-in for a Gloam wallet, sized by `className` for where it
 * sits (sidebar block, top-bar pill, or inline form button).
 *
 * - Signed out: Sign in, which opens Turnkey's email and passkey sheet.
 * - Signed in with no wallet yet: Create wallet, which opens the create sheet.
 * - Signed in with a wallet: a moment while the wallet connects; then the wallet
 *   menu shows the address and this is gone.
 * - When the kit could not start (Turnkey refused this site, or no connection),
 *   `fallback` instead: a sign-in that can only fail is never offered.
 */
export function TurnkeyHeaderSignIn({
  className = "btn btn-ink btn-sm",
  fallback = null,
}: {
  className?: string;
  fallback?: ReactNode;
} = {}) {
  const { authState, clientState, handleLogin } = useTurnkey();
  const needsWallet = useSyncExternalStore(onEmbeddedNeedsWallet, embeddedNeedsWallet, () => false);
  const [busy, setBusy] = useState(false);

  if (clientState === ClientState.Error) return <>{fallback}</>;

  if (authState === AuthState.Authenticated) {
    return needsWallet ? (
      <button type="button" onClick={() => openEmbeddedSheet("create")} className={className}>
        Create wallet
      </button>
    ) : (
      <button type="button" disabled className={className}>
        Opening your wallet…
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        void import("@/lib/track").then(({ track }) => {
          track("wallet_connect_click", { method: "gloam_wallet" });
        });
        try {
          await handleLogin();
        } catch (e) {
          console.warn("[Gloam] Sign-in sheet didn't open:", e);
        } finally {
          setBusy(false);
        }
      }}
      className={className}
    >
      {busy ? "Opening…" : "Sign in"}
    </button>
  );
}
