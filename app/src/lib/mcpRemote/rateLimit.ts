/**
 * Per-IP rate limit for the hosted MCP server. Fixed one-minute windows.
 *
 * Counts live in Upstash Redis (UPSTASH_REDIS_REST_URL + _TOKEN, the same REST
 * pipeline as lib/tractionStore) so every serverless instance shares them, and
 * fall back to process memory when Redis is not set or does not answer.
 * IPs are stored hashed, never in the clear, and expire with their window.
 */
import { createHash } from "crypto";
import { redisConfigured } from "@/lib/tractionStore";

const WINDOW_SEC = 60;
const PREFIX = "gloam:mcp:rl:";
const MEM_MAX_KEYS = 10_000;

export type RateResult = { allowed: boolean; limit: number; remaining: number; retryAfterSec: number };

/** The client's IP as the platform reports it (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "local";
}

function ipKey(ip: string): string {
  return createHash("sha256").update(`gloam-mcp|${ip}`).digest("hex").slice(0, 32);
}

function memCounts(): Map<string, { n: number; exp: number }> {
  const g = globalThis as { __gloamMcpRate?: Map<string, { n: number; exp: number }> };
  if (!g.__gloamMcpRate) g.__gloamMcpRate = new Map();
  return g.__gloamMcpRate;
}

function memIncr(key: string, now: number): number {
  const m = memCounts();
  if (m.size > MEM_MAX_KEYS) {
    for (const [k, v] of m) if (v.exp <= now) m.delete(k);
    if (m.size > MEM_MAX_KEYS) m.clear();
  }
  const cur = m.get(key);
  if (!cur || cur.exp <= now) {
    m.set(key, { n: 1, exp: now + WINDOW_SEC * 1000 });
    return 1;
  }
  cur.n++;
  return cur.n;
}

async function redisIncr(key: string): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, WINDOW_SEC * 2],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string }[];
  const n = Number(json?.[0]?.result);
  if (!Number.isFinite(n) || n < 1) throw new Error("redis: bad INCR result");
  return n;
}

/**
 * Counts one hit for `bucket` from this IP and says whether it is allowed.
 * Never throws: when Redis fails, the in-memory count decides.
 */
export async function hitRateLimit(ip: string, bucket: string, limit: number, now = Date.now()): Promise<RateResult> {
  const window = Math.floor(now / 1000 / WINDOW_SEC);
  const key = `${PREFIX}${bucket}:${ipKey(ip)}:${window}`;
  let n: number;
  if (redisConfigured()) {
    try {
      n = await redisIncr(key);
    } catch {
      n = memIncr(key, now);
    }
  } else {
    n = memIncr(key, now);
  }
  const retryAfterSec = Math.max(1, (window + 1) * WINDOW_SEC - Math.floor(now / 1000));
  return { allowed: n <= limit, limit, remaining: Math.max(0, limit - n), retryAfterSec };
}
