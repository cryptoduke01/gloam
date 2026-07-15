/**
 * Public testnet open gate.
 *
 * Default: 2026-07-16 14:00 WAT (Africa/Lagos, UTC+1) = Nigeria 2:00 PM.
 * Override with NEXT_PUBLIC_TESTNET_OPENS_AT (full ISO-8601 with offset).
 *
 * Force open anytime: NEXT_PUBLIC_TESTNET_FORCE_OPEN=true
 * Early access (founders): /app?early=<NEXT_PUBLIC_TESTNET_EARLY_KEY>
 */

/** Thursday 16 Jul 2026, 14:00 Nigeria time (WAT). */
const DEFAULT_OPENS_AT = "2026-07-16T14:00:00+01:00";

export function testnetOpensAtMs(): number {
  const raw =
    process.env.NEXT_PUBLIC_TESTNET_OPENS_AT?.trim() || DEFAULT_OPENS_AT;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Date.parse(DEFAULT_OPENS_AT);
}

export function testnetForceOpen(): boolean {
  return process.env.NEXT_PUBLIC_TESTNET_FORCE_OPEN === "true";
}

export function testnetEarlyKey(): string | null {
  const k = process.env.NEXT_PUBLIC_TESTNET_EARLY_KEY?.trim();
  return k || null;
}

export function isTestnetOpen(nowMs: number = Date.now()): boolean {
  if (testnetForceOpen()) return true;
  return nowMs >= testnetOpensAtMs();
}

export function msUntilTestnetOpen(nowMs: number = Date.now()): number {
  return Math.max(0, testnetOpensAtMs() - nowMs);
}
