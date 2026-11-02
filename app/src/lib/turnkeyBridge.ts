"use client";

import type { Address, Hex, LocalAccount } from "viem";

/**
 * Bridge between Turnkey's embedded wallet (react-wallet-kit) and viem/wagmi.
 *
 * A sign-in gives a Turnkey client and a wallet account address. `buildTurnkeyAccount`
 * turns that into a viem LocalAccount that signs inside Turnkey, which the wagmi
 * connector (lib/turnkeyConnector) uses, so the app's shield, pay and send code
 * works unchanged with a Gloam wallet.
 *
 * This module imports no Turnkey code, so anything can read it (the wallet menu,
 * the connector) without pulling the kit into the bundle.
 */

/** A transaction Turnkey's gas station sends, paying the network fee. */
export type SponsoredTx = {
  chainId: number;
  from: Address;
  to: Address;
  data?: Hex;
  value?: bigint;
  /** The chain's gas coin, for the message when Turnkey refuses. */
  coin: string;
};

export type EmbeddedSigner = {
  account: LocalAccount;
  /** Sends through Turnkey's gas station. Absent when sponsorship is off. */
  sponsoredSend?: (tx: SponsoredTx) => Promise<Hex>;
};

// Module-level holder so the (module-level) wagmi connector can read the signer
// that the React layer builds after sign-in.
let active: EmbeddedSigner | null = null;
const listeners = new Set<() => void>();

export function setActiveTurnkeySigner(signer: EmbeddedSigner | null) {
  if (signer === active) return;
  active = signer;
  listeners.forEach((fn) => fn());
}

export function getActiveTurnkeySigner(): EmbeddedSigner | null {
  return active;
}

export function getActiveTurnkeyAccount(): LocalAccount | null {
  return active?.account ?? null;
}

export function onTurnkeyAccountChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Build a viem signer from a logged-in Turnkey client + wallet address. */
export async function buildTurnkeyAccount(
  // react-wallet-kit's httpClient is the TurnkeySDKClientBase @turnkey/viem takes;
  // the two packages' declared types differ, so widen here.
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

/* ---------------------------------------------------------------- session */

let signOut: (() => Promise<void>) | null = null;

/** Set by the Turnkey layer: ends the Turnkey session (wagmi then disconnects by itself). */
export function setEmbeddedSignOut(fn: (() => Promise<void>) | null) {
  signOut = fn;
}

/**
 * Signs out of the Gloam wallet. A wagmi disconnect alone would not do: the
 * Turnkey session is still there, so the wallet would connect again at once.
 */
export async function signOutEmbedded(): Promise<void> {
  await signOut?.();
}

/* ---------------------------------------------------------------- the sheet */

export type EmbeddedSheetRequest = "create" | "funding";
type SheetListener = (req: EmbeddedSheetRequest) => void;
const sheetListeners = new Set<SheetListener>();

/** Opens the create-a-wallet sheet, or its Add funds step (from the wallet menu). */
export function openEmbeddedSheet(req: EmbeddedSheetRequest) {
  sheetListeners.forEach((fn) => fn(req));
}

export function onEmbeddedSheetRequest(fn: SheetListener): () => void {
  sheetListeners.add(fn);
  return () => sheetListeners.delete(fn);
}

/**
 * Signed in, the wallet list read, and no Gloam wallet in it: the header offers
 * Create wallet. Set by the sheet (EmbeddedWalletFlow), which does that check.
 */
let needsWallet = false;
const needsWalletListeners = new Set<() => void>();

export function setEmbeddedNeedsWallet(v: boolean) {
  if (v === needsWallet) return;
  needsWallet = v;
  needsWalletListeners.forEach((fn) => fn());
}

export function embeddedNeedsWallet(): boolean {
  return needsWallet;
}

export function onEmbeddedNeedsWallet(fn: () => void): () => void {
  needsWalletListeners.add(fn);
  return () => needsWalletListeners.delete(fn);
}

/* ---------------------------------------------------------------- availability */

/**
 * Whether email and passkey sign-in can work on this page. "unavailable" when the
 * kit failed to start, most often because Turnkey's auth proxy refused this
 * site's origin (Allowed Origins in the dashboard).
 */
export type EmbeddedAvailability = "starting" | "ready" | "unavailable";
let availability: EmbeddedAvailability = "starting";
const availabilityListeners = new Set<() => void>();

export function setEmbeddedAvailability(a: EmbeddedAvailability) {
  if (a === availability) return;
  availability = a;
  availabilityListeners.forEach((fn) => fn());
}

export function embeddedAvailability(): EmbeddedAvailability {
  return availability;
}

export function onEmbeddedAvailability(fn: () => void): () => void {
  availabilityListeners.add(fn);
  return () => availabilityListeners.delete(fn);
}
