"use client";

import { useState } from "react";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";

/**
 * Compact passkey sign-in for the header. Once authenticated, the wagmi
 * auto-connect flips WalletMenu to the connected (address) state, so this
 * renders nothing.
 */
export function TurnkeyHeaderSignIn() {
  const { authState, handleLogin } = useTurnkey();
  const [busy, setBusy] = useState(false);

  if (authState === AuthState.Authenticated) return null;

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
      className="inline-flex min-h-10 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Opening…" : "Sign in"}
    </button>
  );
}
