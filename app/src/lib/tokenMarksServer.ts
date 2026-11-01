/**
 * USD prices for the fixed token list (lib/markedTokens), read here instead of
 * in each browser. The app used to ask CoinGecko directly, and CoinGecko's
 * public API limits by IP: one refused call left every one of these tokens
 * without a price at once. Here one read serves everyone, DEX Screener prices by
 * address whatever CoinGecko doesn't answer for, and the last good price stands
 * in for a while when neither does. Server only.
 */
import { COINGECKO_MARKED, MARKED_BY_CHAIN } from "./markedTokens";
import { cacheGetJson, cacheSetJson } from "./tractionStore";

const FRESH_MS = 60_000;
/** How long a token keeps its last good price when no source answers for it. */
const KEEP_MS = 6 * 3_600_000;
const SNAPSHOT_KEY = "gloam:token-marks:v1";
const UPSTREAM_TIMEOUT_MS = 6_000;
/** Thinner pools are left unpriced: their price is too easy to push around. */
const MIN_LIQUIDITY_USD = 5_000;
const DEX_CHAIN: Record<number, string> = { 4663: "robinhood", 8453: "base", 1: "ethereum" };

type Mark = { usd: number; at: number };
type Snapshot = { at: number; marks: Record<string, Mark> };

export type DexPair = {
  chainId?: string;
  priceUsd?: string;
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
};

const validUsd = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Each token's price from its deepest pool on `chain`. `priceUsd` prices a
 * pair's base token, so a pool that has the token on its quote side says
 * nothing about it and is passed over.
 */
export function dexPrices(pairs: readonly DexPair[], chain: string, addresses: readonly string[]): Map<string, number> {
  const wanted = new Set(addresses.map((a) => a.toLowerCase()));
  const best = new Map<string, { usd: number; depth: number }>();
  for (const p of pairs) {
    const a = p.baseToken?.address?.toLowerCase();
    const usd = Number(p.priceUsd);
    const depth = p.liquidity?.usd ?? 0;
    if (!a || !wanted.has(a) || p.chainId !== chain || !validUsd(usd) || depth < MIN_LIQUIDITY_USD) continue;
    if (depth > (best.get(a)?.depth ?? 0)) best.set(a, { usd, depth });
  }
  return new Map([...best].map(([a, b]) => [a, b.usd]));
}

async function readCoingecko(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(COINGECKO_MARKED.map((t) => t.coingecko!))].join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return out;
  const prices = (await res.json().catch(() => null)) as Record<string, { usd?: unknown }> | null;
  for (const t of COINGECKO_MARKED) {
    const usd = prices?.[t.coingecko!]?.usd;
    if (validUsd(usd)) out.set(t.address.toLowerCase(), usd);
  }
  return out;
}

/** DEX Screener, by address, for whatever `have` is missing. */
async function readDexScreener(have: ReadonlyMap<string, number>): Promise<Map<string, number>> {
  const reads = MARKED_BY_CHAIN.map(async ({ chainId, tokens }) => {
    const chain = DEX_CHAIN[chainId];
    const missing = tokens.map((t) => t.address.toLowerCase()).filter((a) => !have.has(a));
    if (!chain || !missing.length) return new Map<string, number>();
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${missing.join(",")}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    }).catch(() => null);
    const pairs = res?.ok ? ((await res.json().catch(() => null)) as DexPair[] | null) : null;
    return Array.isArray(pairs) ? dexPrices(pairs, chain, missing) : new Map<string, number>();
  });
  const out = new Map<string, number>();
  for (const found of await Promise.all(reads)) found.forEach((usd, a) => out.set(a, usd));
  return out;
}

async function read(prev: Snapshot | null): Promise<Snapshot> {
  const at = Date.now();
  const gecko = await readCoingecko();
  const dex = await readDexScreener(gecko);
  const marks: Record<string, Mark> = {};
  for (const [a, m] of Object.entries(prev?.marks ?? {})) {
    if (at - m.at < KEEP_MS) marks[a] = m;
  }
  for (const [a, usd] of [...dex, ...gecko]) marks[a] = { usd, at };
  return { at, marks };
}

let snapshot: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

async function fresh(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.at < FRESH_MS) return snapshot;
  const stored = await cacheGetJson<Snapshot>(SNAPSHOT_KEY);
  if (stored?.marks && (!snapshot || stored.at > snapshot.at)) snapshot = stored;
  if (snapshot && Date.now() - snapshot.at < FRESH_MS) return snapshot;
  if (!inflight) {
    inflight = read(snapshot)
      .then(async (next) => {
        snapshot = next;
        await cacheSetJson(SNAPSHOT_KEY, next, KEEP_MS / 1000);
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** USD per unit by token address (lowercase). A token nothing prices is left out. */
export async function loadTokenMarks(): Promise<Record<string, number>> {
  const { marks } = await fresh();
  return Object.fromEntries(Object.entries(marks).map(([a, m]) => [a, m.usd]));
}
