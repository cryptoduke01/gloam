"use client";

import type { ReactNode } from "react";
import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import "@turnkey/react-wallet-kit/styles.css";

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
  };

  return (
    <TurnkeyProvider
      config={config}
      callbacks={{
        onError: (error) => console.error("Turnkey error:", error),
      }}
    >
      {children}
    </TurnkeyProvider>
  );
}
