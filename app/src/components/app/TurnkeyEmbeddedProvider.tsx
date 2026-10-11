"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ORG_ID = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
const AUTH_PROXY_CONFIG_ID =
  process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID;

/**
 * Turnkey passkey sign-in is temporarily OFF.
 * It was surfacing an error on the sign-in button, so we fall back to normal
 * wallet connect for launch. The integration is left fully wired; re-enable it
 * by setting NEXT_PUBLIC_TURNKEY_ENABLED=true (with the org + auth-proxy env
 * vars present) once the passkey flow is fixed.
 */
const FEATURE_FLAG = process.env.NEXT_PUBLIC_TURNKEY_ENABLED === "true";
export const TURNKEY_ENABLED =
  FEATURE_FLAG && Boolean(ORG_ID && AUTH_PROXY_CONFIG_ID);

/** The kit is a large bundle; it only downloads when the flag is on. */
const TurnkeyKitProvider = dynamic(() => import("./TurnkeyKit"));

/**
 * Wraps the product app with Turnkey embedded wallets (passkey / email login).
 * Scoped to /app only, the marketing site never mounts this.
 */
export function TurnkeyEmbeddedProvider({ children }: { children: ReactNode }) {
  if (!TURNKEY_ENABLED) return <>{children}</>;
  return <TurnkeyKitProvider>{children}</TurnkeyKitProvider>;
}
