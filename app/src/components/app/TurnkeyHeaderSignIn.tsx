"use client";

import { useState } from "react";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";

/**
 * Compact passkey sign-in for the header. Once authenticated, the wagmi
 * auto-connect flips WalletMenu to the connected (address) state, so this
 * renders nothing. `className` lets the caller size the pill for where it
 * sits (sidebar block, top-bar pill, or inline form button).
 */
export function TurnkeyHeaderSignIn({
  className = "btn btn-ink btn-sm",
}: {
  className?: string;
} = {}) {
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
      className={className}
    >
      {busy ? "Opening…" : "Sign in"}
    </button>
  );
}
