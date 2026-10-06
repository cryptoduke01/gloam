"use client";

/**
 * Screening in the browser, before the wallet is asked to sign. The vendored
 * list is checked right here (instant, works offline), then /api/screen, which
 * can also run the optional Chainalysis check and, on Tempo when an asset is
 * given, the issuer's TIP-403 transfer policy. If the server cannot be reached,
 * the local list result stands (the token still enforces TIP-403 on-chain).
 * The relay and /api/screen check again on the server; this is the early,
 * friendly stop, not the only one.
 */
import { readDemo } from "./demoFlag";
import { anySanctioned, normalizeAddress, type ScreenOptions, type ScreenResult } from "./screening";

export async function screenWallets(
  addresses: readonly (string | null | undefined)[],
  opts?: ScreenOptions
): Promise<ScreenResult> {
  // Recording demo: a pretend wallet, nothing to screen.
  if (readDemo()) return { allowed: true };
  const list = addresses.filter((a): a is string => typeof a === "string" && a.length > 0);
  if (list.length === 0) return { allowed: true };
  if (anySanctioned(list)) return { allowed: false };
  // Only a well-formed context is sent, so a bad one can never cost the
  // server-side sanctions check a 400.
  const asset = normalizeAddress(opts?.asset);
  const context =
    opts && Number.isSafeInteger(opts.chainId) && asset
      ? { chainId: opts.chainId, asset, ...(opts.flow ? { flow: opts.flow } : {}) }
      : {};
  try {
    const res = await fetch("/api/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: list, ...context }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      allowed?: boolean;
      message?: string;
      scope?: string;
    } | null;
    if (json?.allowed === false) {
      return json.scope === "asset" && typeof json.message === "string"
        ? { allowed: false, message: json.message, scope: "asset" }
        : { allowed: false };
    }
  } catch {
    /* offline: the list check above already passed */
  }
  return { allowed: true };
}
