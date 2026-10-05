"use client";

/**
 * Screening in the browser, before the wallet is asked to sign. The vendored
 * list is checked right here (instant, works offline), then /api/screen, which
 * can also run the optional Chainalysis check. If the server cannot be reached,
 * the local list result stands. The relay and /api/screen check again on the
 * server; this is the early, friendly stop, not the only one.
 */
import { readDemo } from "./demoFlag";
import { anySanctioned } from "./screening";

export async function screenWallets(
  addresses: readonly (string | null | undefined)[]
): Promise<{ allowed: boolean }> {
  // Recording demo: a pretend wallet, nothing to screen.
  if (readDemo()) return { allowed: true };
  const list = addresses.filter((a): a is string => typeof a === "string" && a.length > 0);
  if (list.length === 0) return { allowed: true };
  if (anySanctioned(list)) return { allowed: false };
  try {
    const res = await fetch("/api/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: list }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { allowed?: boolean } | null;
    if (json?.allowed === false) return { allowed: false };
  } catch {
    /* offline: the list check above already passed */
  }
  return { allowed: true };
}
