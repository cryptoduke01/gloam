"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import { TURNKEY_AUTH_PROXY_CONFIG_ID, TURNKEY_ORGANIZATION_ID, embeddedRpId } from "@/lib/embeddedWallet";
import { TurnkeyWagmiSync } from "./TurnkeyWagmiSync";
import { ClientOnly } from "./ClientOnly";

/**
 * Turnkey's modal renders outside our token system, so it takes literal
 * colours. These mirror the Gloam tokens in globals.css: ink on paper with cool
 * greys, and the sealed green only for the success state.
 */
const TURNKEY_COLORS: NonNullable<
  NonNullable<TurnkeyProviderConfig["ui"]>["colors"]
> = {
  light: {
    primary: "#0B0C0E",
    primaryText: "#FFFFFF",
    button: "#F3F4F5",
    modalBackground: "#FFFFFF",
    modalText: "#0B0C0E",
    iconBackground: "#F3F4F5",
    iconText: "#5F636A",
    success: "#2E7D53",
    successText: "#FFFFFF",
    danger: "#B4362A",
    dangerText: "#FFFFFF",
  },
  dark: {
    primary: "#F4F5F6",
    primaryText: "#0B0C0E",
    button: "#17181B",
    modalBackground: "#111214",
    modalText: "#F4F5F6",
    iconBackground: "#1E2023",
    iconText: "#9B9FA6",
    success: "#8FD3AD",
    successText: "#0B0C0E",
    danger: "#F08A7E",
    dangerText: "#0B0C0E",
  },
};

/** Follows html[data-theme] so the Turnkey modal matches the app theme. */
function subscribeTheme(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
}
const readDark = () => document.documentElement.dataset.theme === "dark";
const serverDark = () => false;

/**
 * The Turnkey embedded wallet provider itself. Loaded only when the feature
 * flag is on (see TurnkeyEmbeddedProvider), so the kit stays out of the app
 * bundle while passkey sign-in is switched off.
 */
export default function TurnkeyKitProvider({ children }: { children: ReactNode }) {
  const dark = useSyncExternalStore(subscribeTheme, readDark, serverDark);
  // The kit builds its passkey signer once, from the config of the first render
  // in the browser, so the relying party is read then (it never reaches the page's
  // markup). On the server there is no host and no signer.
  const [rpId] = useState(() => (typeof window === "undefined" ? undefined : embeddedRpId(window.location.hostname)));

  // Memoised so the provider only rebuilds its config when the theme flips,
  // not on every parent render.
  const config = useMemo<TurnkeyProviderConfig>(
    () => ({
      organizationId: TURNKEY_ORGANIZATION_ID,
      authProxyConfigId: TURNKEY_AUTH_PROXY_CONFIG_ID,
      ...(rpId ? { passkeyConfig: { rpId } } : {}),
      // Browser wallets connect through wagmi, not the kit, so its own wallet
      // manager stays off: nothing to start, and no connected wallet ever shows
      // up in its wallet list next to the Gloam wallet.
      walletConfig: {
        features: { auth: false, connecting: false },
        chains: { ethereum: { native: false }, solana: { native: false } },
      },
      ui: {
        darkMode: dark,
        logoLight: "/brand/logo.png",
        logoDark: "/brand/logo.png",
        borderRadius: 16,
        preferLargeActionButtons: true,
        authModal: {
          // We offer wallet connect ourselves ("Use a wallet"), so drop it here.
          methods: { walletAuthEnabled: false },
          methodOrder: ["email", "passkey"],
        },
        colors: TURNKEY_COLORS,
      },
    }),
    [dark, rpId]
  );

  // One object for the provider's life: the kit's methods (refreshWallets, logout)
  // are rebuilt whenever this changes, and every page change re-renders this component.
  const callbacks = useMemo(
    () => ({ onError: (error: unknown) => console.error("[Gloam] Turnkey:", error) }),
    []
  );

  return (
    <TurnkeyProvider
      config={config}
      callbacks={callbacks}
    >
      <ClientOnly>
        <TurnkeyWagmiSync />
      </ClientOnly>
      {children}
    </TurnkeyProvider>
  );
}
