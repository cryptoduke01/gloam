"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import { TurnkeyWagmiSync } from "./TurnkeyWagmiSync";
import { ClientOnly } from "./ClientOnly";

const ORG_ID = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
const AUTH_PROXY_CONFIG_ID =
  process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID;

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

  // Memoised so the provider only rebuilds its config when the theme flips,
  // not on every parent render.
  const config = useMemo<TurnkeyProviderConfig>(
    () => ({
      organizationId: ORG_ID!,
      authProxyConfigId: AUTH_PROXY_CONFIG_ID!,
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
    [dark]
  );

  return (
    <TurnkeyProvider
      config={config}
      callbacks={{
        onError: (error) => console.error("Turnkey error:", error),
      }}
    >
      <ClientOnly>
        <TurnkeyWagmiSync />
      </ClientOnly>
      {children}
    </TurnkeyProvider>
  );
}
