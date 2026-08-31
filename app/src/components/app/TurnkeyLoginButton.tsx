"use client";

import { useState } from "react";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";

/**
 * Passkey / email sign-in entry for the embedded wallet.
 * Only mount this inside TurnkeyEmbeddedProvider (i.e. when TURNKEY_ENABLED),
 * otherwise useTurnkey has no context.
 */
export function TurnkeyLoginButton() {
  const { authState, handleLogin, wallets } = useTurnkey();
  const [busy, setBusy] = useState(false);
  const signedIn = authState === AuthState.Authenticated;

  if (signedIn) {
    return (
      <div className="rounded-xl border border-lime/30 bg-lime/5 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Signed in with passkey</p>
        <p className="mt-0.5 text-xs text-mute">
          {wallets.length} embedded wallet{wallets.length === 1 ? "" : "s"} ready
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await handleLogin();
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-lime px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Opening…" : "Sign in with passkey"}
    </button>
  );
}
