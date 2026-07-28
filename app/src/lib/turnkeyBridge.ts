"use client";

import type { LocalAccount } from "viem";

/**
 * Bridge between Turnkey's embedded wallet (react-wallet-kit) and viem/wagmi.
 *
 * A passkey login gives us a Turnkey http client + a wallet account address.
 * `createAccount` turns that into a viem LocalAccount that can sign, which the
 * wagmi connector then uses so the whole app transacts through the embedded
 * wallet with no changes to the shield/trade/send code.
 */

// Module-level holder so the (module-level) wagmi connector can read the signer
// that the React layer builds after login.
let activeAccount: LocalAccount | null = null;
const listeners = new Set<() => void>();

export function setActiveTurnkeyAccount(account: LocalAccount | null) {
  activeAccount = account;
  listeners.forEach((fn) => fn());
}

export function getActiveTurnkeyAccount(): LocalAccount | null {
  return activeAccount;
}

export function onTurnkeyAccountChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Build a viem signer from a logged-in Turnkey client + wallet address. */
export async function buildTurnkeyAccount(
  // react-wallet-kit's httpClient satisfies @turnkey/viem's client shape at
  // runtime; the bundled core types differ across packages, so widen here.
  client: unknown,
  organizationId: string,
  signWith: string
): Promise<LocalAccount> {
  // Lazy import: keeps @turnkey/viem out of the wagmi config's SSR import graph.
  const { createAccount } = await import("@turnkey/viem");
  return createAccount({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any,
    organizationId,
    signWith,
  });
}
