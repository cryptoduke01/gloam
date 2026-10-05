/**
 * Server-side screening for /api/screen and the relay.
 *
 * Always: the vendored OFAC snapshot (lib/screening.ts). Optionally: the
 * Chainalysis free sanctions API, only when CHAINALYSIS_API_KEY is set in the
 * server environment. If that API is slow or down, the snapshot result stands
 * (it never blocks a wallet the list does not, and never unblocks one it does).
 *
 * Addresses are never logged, and the answer is only allowed or not.
 */
import { anySanctioned, normalizeAddress } from "./screening";

const CHAINALYSIS_URL = "https://public.chainalysis.com/api/v1/address/";
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 5_000;
const remote = new Map<string, { at: number; hit: boolean }>();

/** True when the optional Chainalysis check is configured (never the key itself). */
export function chainalysisEnabled(): boolean {
  return Boolean(process.env.CHAINALYSIS_API_KEY?.trim());
}

async function chainalysisHit(address: string): Promise<boolean> {
  const key = process.env.CHAINALYSIS_API_KEY?.trim();
  if (!key) return false;
  const cached = remote.get(address);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.hit;
  try {
    const res = await fetch(CHAINALYSIS_URL + address, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { identifications?: unknown[] };
    const hit = Array.isArray(json.identifications) && json.identifications.length > 0;
    if (remote.size >= CACHE_MAX) remote.clear();
    remote.set(address, { at: Date.now(), hit });
    return hit;
  } catch {
    return false;
  }
}

/** Screen public addresses. Values that are not 0x addresses are ignored. */
export async function screenAddresses(addresses: readonly unknown[]): Promise<{ allowed: boolean }> {
  const list = [...new Set(addresses.map(normalizeAddress).filter((a): a is string => a !== null))];
  if (anySanctioned(list)) return { allowed: false };
  if (!chainalysisEnabled() || list.length === 0) return { allowed: true };
  const hits = await Promise.all(list.map(chainalysisHit));
  return { allowed: !hits.some(Boolean) };
}
