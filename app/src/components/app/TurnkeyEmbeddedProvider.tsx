"use client";

import type { ReactNode } from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css";
import { TurnkeyWagmiSync } from "./TurnkeyWagmiSync";
import { ClientOnly } from "./ClientOnly";

const ORG_ID = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
const AUTH_PROXY_CONFIG_ID =
  process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID;

/**
 * True only once both dashboard values are wired in .env.
 * Until then the provider is a passthrough so the app runs unchanged.
 */
export const TURNKEY_ENABLED = Boolean(ORG_ID && AUTH_PROXY_CONFIG_ID);

/**
 * Wraps the product app with Turnkey embedded wallets (passkey / email login).
 * Scoped to /app only — the marketing site never mounts this.
 */
export function TurnkeyEmbeddedProvider({ children }: { children: ReactNode }) {
  if (!TURNKEY_ENABLED) return <>{children}</>;

  const config: TurnkeyProviderConfig = {
    organizationId: ORG_ID!,
    authProxyConfigId: AUTH_PROXY_CONFIG_ID!,
    ui: {
      darkMode: true,
      logoLight: "/brand/logo.png",
      logoDark: "/brand/logo.png",
      borderRadius: 14,
      preferLargeActionButtons: true,
      authModal: {
        // We offer wallet connect ourselves ("Use a wallet"), so drop it here.
        methods: { walletAuthEnabled: false },
        methodOrder: ["email", "passkey"],
      },
      colors: {
        dark: {
          primary: "#c8ff00",
          primaryText: "#000000",
          modalBackground: "#0a0a0a",
          modalText: "#ffffff",
        },
      },
    },
  };

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
