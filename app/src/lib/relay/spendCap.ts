/**
 * The most the relay spends on gas in an hour, per chain, across every kind of send.
 * New sends may use NEW_SEND_SHARE_PCT of it. The rest is kept for money on its way
 * back to someone: a refund or an exit. Each send holds what it could cost before it
 * goes, and gives back what it didn't use once its receipt is read.
 *
 * GLOAM_RELAY_HOURLY_SPEND_<chainId> (server env) sets it, in the chain's gas coin
 * ("0.02"); "off" turns it off for that chain. The defaults sit well over what the
 * chains have used so far (peak hour to 2 November 2026: none on Ethereum, 15 sends on
 * Base, 34 on Robinhood Chain, 1 on Tempo) and leave room for a 200-person payroll at
 * ordinary gas. A chain not listed has no cap.
 *
 * GLOAM_RELAY_IP_SENDS_<chainId> sets how many sends one IP may ask for in 10 minutes
 * on a chain with a lower limit than the relay's own, or "off" for none.
 */
import { parseEther } from "viem";

type Env = Record<string, string | undefined>;

export const DEFAULT_HOURLY_SPEND: Readonly<Record<number, string>> = { 1: "0.05", 8453: "0.01", 4663: "0.02", 4217: "1" };
export const NEW_SEND_SHARE_PCT = 80n;
export const DEFAULT_IP_SENDS: Readonly<Record<number, number>> = { 1: 120 };

const warned = new Set<string>();

function warnOnce(name: string) {
  if (!warned.has(name)) console.warn("gloam_relay_limit_invalid", JSON.stringify({ name }));
  warned.add(name);
}

/** The chain's cap in its gas coin's smallest unit, or null when it has none. A value that isn't a number keeps the default. */
export function hourlySpendWei(chainId: number, env: Env = process.env): bigint | null {
  const name = `GLOAM_RELAY_HOURLY_SPEND_${chainId}`;
  const raw = env[name]?.trim();
  const fallback = DEFAULT_HOURLY_SPEND[chainId];
  if (raw?.toLowerCase() === "off") return null;
  if (raw) {
    if (/^\d{1,9}(\.\d{1,18})?$/.test(raw) && parseEther(raw) > 0n) return parseEther(raw);
    warnOnce(name);
  }
  return fallback ? parseEther(fallback) : null;
}

/** Sends one IP may ask for in 10 minutes on this chain, or null when only the relay's own limit applies. */
export function ipSendsLimit(chainId: number, env: Env = process.env): number | null {
  const name = `GLOAM_RELAY_IP_SENDS_${chainId}`;
  const raw = env[name]?.trim();
  if (raw?.toLowerCase() === "off") return null;
  if (raw) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n > 0) return n;
    warnOnce(name);
  }
  return DEFAULT_IP_SENDS[chainId] ?? null;
}
