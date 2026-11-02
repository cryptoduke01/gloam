/**
 * The most the relay spends on gas in an hour, per chain, across every kind of send.
 * New sends may use NEW_SEND_SHARE_PCT of it. The rest is kept for money on its way
 * back to someone: a cash out, a refund or an exit. Each send holds what it could
 * cost before it goes, and gives back what it didn't use once its receipt is read.
 * On Base that includes the fee for posting it to Ethereum (L1_FEE_MARGIN_PCT).
 *
 * One sender (an IP, or a partner account) may hold SENDER_SHARE_PCT of the cap in
 * an hour, every kind of send it asks for together, apart from refunds and exits.
 * GLOAM_RELAY_SENDER_SHARE_<chainId> sets it, in percent, or "off" for none. The
 * default fits a 200-payment payroll from one browser at today's gas on every chain
 * (about 35% of the cap on Robinhood Chain), and the busiest hour so far, every
 * sender together, used about 6%.
 *
 * GLOAM_RELAY_HOURLY_SPEND_<chainId> (server env) sets it, in the chain's gas coin
 * ("0.02"); "off" turns it off for that chain. The defaults sit well over what the
 * chains have used so far (peak hour to 2 November 2026: none on Ethereum, 15 sends on
 * Base, 34 on Robinhood Chain, 1 on Tempo) and leave room for a 200-person payroll at
 * ordinary gas. A chain not listed has no cap.
 *
 * GLOAM_RELAY_IP_SENDS_<chainId> sets how many sends one IP may ask for in 10 minutes
 * on a chain with a lower limit than the relay's own, or "off" for none. Payment
 * messages don't count, and a browser proves each send first, so a payroll stays under it.
 */
import { parseEther } from "viem";

type Env = Record<string, string | undefined>;

export const DEFAULT_HOURLY_SPEND: Readonly<Record<number, string>> = { 1: "0.05", 8453: "0.01", 4663: "0.02", 4217: "1" };
export const NEW_SEND_SHARE_PCT = 80n;
/** Payment messages outside the relay's paid message budget may hold this share of the cap between them. */
export const MEMO_SPEND_SHARE_PCT = 20n;
export const DEFAULT_IP_SENDS: Readonly<Record<number, number>> = { 1: 120 };
export const DEFAULT_SENDER_SHARE_PCT = 40;
/**
 * Chains that charge for posting a transaction to Ethereum on top of its gas. A send
 * there holds this much more than its gas, and settles at what its receipt shows (l1Fee).
 * Measured on Base: about 1% of the gas normally, 38% in one spike.
 */
export const L1_FEE_MARGIN_PCT: Readonly<Record<number, bigint>> = { 8453: 50n, 84532: 50n };

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

/** The share of the cap one sender may hold in an hour, in percent, or null for no share of its own. */
export function senderSharePct(chainId: number, env: Env = process.env): number | null {
  const name = `GLOAM_RELAY_SENDER_SHARE_${chainId}`;
  const raw = env[name]?.trim();
  if (raw?.toLowerCase() === "off") return null;
  if (raw) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n > 0 && n <= 100) return n;
    warnOnce(name);
  }
  return DEFAULT_SENDER_SHARE_PCT;
}
