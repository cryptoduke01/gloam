"use client";

import { useEffect, useRef } from "react";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";
import {
  buildTurnkeyAccount,
  setActiveTurnkeyAccount,
} from "@/lib/turnkeyBridge";

/**
 * When a passkey/email login completes, build the viem signer for the embedded
 * wallet and publish it so the wagmi connector can use it. Renders nothing.
 */
export function TurnkeyWagmiSync() {
  const { authState, wallets, httpClient, config, session, refreshWallets } =
    useTurnkey();
  const triedRefresh = useRef(false);

  useEffect(() => {
    if (authState !== AuthState.Authenticated) {
      setActiveTurnkeyAccount(null);
      triedRefresh.current = false;
      return;
    }

    // Freshly signed-up users often have no wallet in state yet. Fetch once.
    if (!wallets || wallets.length === 0) {
      if (refreshWallets && !triedRefresh.current) {
        triedRefresh.current = true;
        void refreshWallets();
      }
      return;
    }
    triedRefresh.current = false;

    const signWith = wallets[0]?.accounts?.[0]?.address;
    // The signer belongs to the user's sub-org (from the session), not the
    // parent org id in config.
    const organizationId =
      (session as { organizationId?: string } | undefined)?.organizationId ??
      config?.organizationId;

    if (!httpClient || !signWith || !organizationId) {
      console.warn("[Gloam] Turnkey signer not ready yet", {
        hasClient: Boolean(httpClient),
        signWith,
        organizationId,
        walletCount: wallets.length,
      });
      return;
    }

    let cancelled = false;
    void buildTurnkeyAccount(httpClient, organizationId, signWith)
      .then((account) => {
        if (cancelled) return;
        console.info("[Gloam] Turnkey signer ready:", account.address);
        setActiveTurnkeyAccount(account);
      })
      .catch((err) => {
        console.error("[Gloam] Turnkey signer build failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [authState, wallets, httpClient, config, session, refreshWallets]);

  return null;
}
