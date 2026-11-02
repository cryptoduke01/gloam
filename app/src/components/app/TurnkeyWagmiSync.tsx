"use client";

import { useEffect, useRef } from "react";
import { AuthState, ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import type { Hex } from "viem";
import { SPONSOR_CHAINS, sponsorRefusedText, turnkeyRefused, waitForSponsoredHash } from "@/lib/embeddedGas";
import { EmbeddedNotSentError } from "@/lib/embeddedProvider";
import { pickEmbeddedWallet } from "@/lib/embeddedWallet";
import {
  buildTurnkeyAccount,
  setActiveTurnkeySigner,
  setEmbeddedAvailability,
  setEmbeddedSignOut,
  type EmbeddedSigner,
  type SponsoredTx,
} from "@/lib/turnkeyBridge";

/** The caip2 union in this SDK version lists fewer chains than Turnkey sponsors (Robinhood Chain, Tempo). */
type Caip2 = Parameters<ReturnType<typeof useTurnkey>["ethSendTransaction"]>[0]["transaction"]["caip2"];

/**
 * Once a sign-in completes and the Gloam wallet exists, builds the viem signer
 * for it and publishes it for the wagmi connector (lib/turnkeyBridge). Also
 * reports whether the kit started, wires sign-out, and keeps the private-balance
 * backup on (lib/embeddedRecovery). Renders nothing.
 */
export function TurnkeyWagmiSync() {
  const { authState, clientState, wallets, httpClient, session, logout, ethSendTransaction } = useTurnkey();
  const organizationId = session?.organizationId;
  const address = pickEmbeddedWallet(wallets)?.address;

  // The latest client values, read when a sponsored send goes out.
  const latest = useRef({ httpClient, organizationId, ethSendTransaction });
  useEffect(() => {
    latest.current = { httpClient, organizationId, ethSendTransaction };
  });

  useEffect(() => {
    if (clientState === ClientState.Error) {
      // This kit version reports a refused auth proxy config to no one. The usual
      // cause: this page's origin is not in the dashboard's Allowed Origins.
      console.warn(
        `[Gloam] Email and passkey sign-in did not start on ${window.location.origin}. Check that this origin is in the Turnkey dashboard's Allowed Origins (DEPLOY-TURNKEY.md).`,
      );
    }
    setEmbeddedAvailability(
      clientState === ClientState.Error ? "unavailable" : clientState === ClientState.Ready ? "ready" : "starting",
    );
  }, [clientState]);

  useEffect(() => {
    setEmbeddedSignOut(async () => {
      await logout();
    });
    return () => setEmbeddedSignOut(null);
  }, [logout]);

  useEffect(() => {
    if (authState !== AuthState.Authenticated) {
      setActiveTurnkeySigner(null);
      return;
    }
    // Signed in and the wallet list says nothing yet (or no wallet): the create
    // sheet takes it from here (EmbeddedWalletFlow).
    if (!httpClient || !organizationId || !address) return;

    async function sponsoredSend(tx: SponsoredTx): Promise<Hex> {
      const { httpClient: client, organizationId: org, ethSendTransaction: send } = latest.current;
      if (!client || !org) throw new EmbeddedNotSentError(sponsorRefusedText(tx.coin));
      let statusId: string;
      try {
        statusId = await send({
          organizationId: org,
          transaction: {
            from: tx.from,
            caip2: `eip155:${tx.chainId}` as Caip2,
            to: tx.to,
            ...(tx.value !== undefined ? { value: tx.value.toString() } : {}),
            ...(tx.data ? { data: tx.data } : {}),
            sponsor: true,
          },
        });
      } catch (e) {
        console.warn("[Gloam] Sponsored send not taken:", e);
        // Only a refusal Turnkey answered proves nothing went out.
        if (turnkeyRefused(e)) throw new EmbeddedNotSentError(sponsorRefusedText(tx.coin));
        throw e;
      }
      return waitForSponsoredHash(() =>
        client.getSendTransactionStatus({ organizationId: org, sendTransactionStatusId: statusId }),
      );
    }

    let cancelled = false;
    void buildTurnkeyAccount(httpClient, organizationId, address)
      .then((account) => {
        if (cancelled) return;
        const signer: EmbeddedSigner = SPONSOR_CHAINS.size > 0 ? { account, sponsoredSend } : { account };
        setActiveTurnkeySigner(signer);
        void import("@/lib/embeddedRecovery").then(({ syncEmbeddedRecovery }) =>
          syncEmbeddedRecovery({ address: account.address, sign: (message) => account.signMessage({ message }) }),
        );
      })
      .catch((err) => {
        console.error("[Gloam] The Gloam wallet's signer didn't start:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [authState, httpClient, organizationId, address]);

  return null;
}
