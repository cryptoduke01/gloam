/**
 * Gloam wallets: a wallet made inside the app after signing in with an email
 * or a passkey. Its key is made and kept by Turnkey in secure hardware, so the
 * page never sees it and there is no seed phrase. Signing in again, on any
 * device, opens the same wallet.
 *
 * Everything here is plain logic, with no React and no Turnkey SDK, so the
 * self-tests run it (scripts/selftest-embedded-flow.mts) and a server page can
 * read the switch.
 *
 * The switch: NEXT_PUBLIC_TURNKEY_ENABLED must be exactly "true", and both
 * dashboard ids must be set. Until then nothing in the app changes.
 */

/** The wagmi connector id of a Gloam wallet. */
export const EMBEDDED_CONNECTOR_ID = "gloam-turnkey";

export type EmbeddedEnv = {
  enabled?: string | undefined;
  organizationId?: string | undefined;
  authProxyConfigId?: string | undefined;
};

/**
 * Written out with each variable read by its full name, so Next inlines the
 * values into the browser bundle (it does not for process.env read any other way).
 */
const BUILD_ENV: EmbeddedEnv = {
  enabled: process.env.NEXT_PUBLIC_TURNKEY_ENABLED,
  organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID,
};

/** Gloam wallets are on: the flag says exactly "true" and both dashboard ids are there. */
export function embeddedWalletsOn(env: EmbeddedEnv = BUILD_ENV): boolean {
  return env.enabled?.trim() === "true" && Boolean(env.organizationId?.trim()) && Boolean(env.authProxyConfigId?.trim());
}

export const EMBEDDED_WALLETS = embeddedWalletsOn();
export const TURNKEY_ORGANIZATION_ID = BUILD_ENV.organizationId?.trim() ?? "";
export const TURNKEY_AUTH_PROXY_CONFIG_ID = BUILD_ENV.authProxyConfigId?.trim() ?? "";

/**
 * The passkey's relying party. On gloam.trade and its subdomains it is the bare
 * domain, so a passkey made on www.gloam.trade (where the apex redirects) also
 * works if the site ever drops the www. WebAuthn lets a page claim its parent
 * domain. Everywhere else (localhost, a preview deployment) it is the page's own
 * host. Never change it once people have passkeys: theirs would stop working.
 */
export function embeddedRpId(hostname: string): string {
  const h = hostname.toLowerCase();
  return h === "gloam.trade" || h.endsWith(".gloam.trade") ? "gloam.trade" : h;
}

/** The slice of a Turnkey wallet this app reads. */
export type WalletLike = {
  source?: string;
  walletId?: string;
  walletName?: string;
  accounts?: readonly { address?: string; addressFormat?: string }[];
};

/**
 * The Gloam wallet to sign with: the first embedded wallet (Turnkey can also list
 * wallets it connected from the browser, which are not this) that has an
 * Ethereum account. Null when there is none yet.
 */
export function pickEmbeddedWallet(wallets: readonly WalletLike[] | undefined): { walletId: string; walletName: string; address: string } | null {
  for (const w of wallets ?? []) {
    if (w.source !== "embedded") continue;
    const acct = w.accounts?.find((a) => a.addressFormat === "ADDRESS_FORMAT_ETHEREUM" && typeof a.address === "string");
    if (acct?.address) return { walletId: w.walletId ?? "", walletName: w.walletName ?? "", address: acct.address };
  }
  return null;
}

/** What a wallet is called when the name field is left empty. */
export const DEFAULT_WALLET_NAME = "Gloam wallet";
export const WALLET_NAME_MAX = 40;

/** Why this name can't be used, or null. An empty name is fine: the default is used. */
export function walletNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length > WALLET_NAME_MAX) return `Keep the name to ${WALLET_NAME_MAX} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(n)) return "Use letters, numbers and spaces.";
  return null;
}

/** The name sent to Turnkey: what was typed, tidied, or the default. */
export function walletNameFor(typed: string): string {
  const n = typed.trim().replace(/\s+/g, " ");
  return n || DEFAULT_WALLET_NAME;
}

/**
 * Where the create-a-wallet sheet is, from what is known about the session:
 * - hidden: nothing to show (signed out, or a wallet that is already set up)
 * - checking: signed in, and the wallet list is still being read. Nothing is
 *   shown, so someone with a wallet never sees "Create wallet" flash by
 * - create: signed in with no Gloam wallet yet: the name field and one button
 * - creating: the wallet is being made
 * - failed: it was not made; the sheet says why and offers to try again
 * - funding: just made, so the next step is Add funds
 */
export type EmbeddedFlowStep = "hidden" | "checking" | "create" | "creating" | "failed" | "funding";

export type EmbeddedFlowState = {
  signedIn: boolean;
  /** The wallet list has been read since signing in. */
  checked: boolean;
  /** A Gloam wallet with an Ethereum account exists. */
  hasWallet: boolean;
  creating: boolean;
  error: string | null;
  /** Made in this visit, or Add funds was asked for from the wallet menu. */
  funding: boolean;
  /** The person closed the sheet. */
  dismissed: boolean;
};

export function embeddedFlowStep(s: EmbeddedFlowState): EmbeddedFlowStep {
  if (!s.signedIn) return "hidden";
  if (s.creating) return "creating";
  if (s.error) return "failed";
  if (!s.checked) return "checking";
  if (!s.hasWallet) return s.dismissed ? "hidden" : "create";
  return s.funding && !s.dismissed ? "funding" : "hidden";
}

/** Plain words for a wallet that was not made. Never the SDK's own text, which names internals. */
export function createWalletErrorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e ?? "");
  if (/cancel|abort|not ?allowed/i.test(text)) return "Nothing was made. Try again when you're ready.";
  if (/session|expired|unauthori[sz]ed|not authenticated/i.test(text)) return "Your sign-in ran out. Sign in again, then create the wallet.";
  if (/network|fetch|timed? ?out/i.test(text)) return "Couldn't reach the wallet service. Check your connection and try again.";
  return "The wallet wasn't made. Try again.";
}
