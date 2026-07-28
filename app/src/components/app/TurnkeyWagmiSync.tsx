"use client";

import { useEffect } from "react";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";
import {
  buildTurnkeyAccount,
  setActiveTurnkeyAccount,
} from "@/lib/turnkeyBridge";

/**
 * When a passkey login completes, build the viem signer for the embedded
 * wallet and publish it so the wagmi connector can use it. Renders nothing.
 * Mounted only inside TurnkeyEmbeddedProvider (i.e. when TURNKEY_ENABLED).
 */
export function TurnkeyWagmiSync() {
  const { authState, wallets, httpClient, config } = useTurnkey();

  useEffect(() => {
    if (authState !== AuthState.Authenticated) {
      setActiveTurnkeyAccount(null);
      return;
    }
    const signWith = wallets[0]?.accounts?.[0]?.address;
    const organizationId = config?.organizationId;
    if (!httpClient || !signWith || !organizationId) return;

    let cancelled = false;
    void buildTurnkeyAccount(httpClient, organizationId, signWith)
      .then((account) => {
        if (!cancelled) setActiveTurnkeyAccount(account);
      })
      .catch((err) => {
        console.error("Turnkey signer build failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [authState, wallets, httpClient, config]);

  return null;
}
