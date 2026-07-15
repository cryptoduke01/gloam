/**
 * Product event store for /admin traction.
 *
 * Persistence:
 *  1. Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) — durable
 *  2. In-process ring buffer — last N events (lost on cold start; fine for dev)
 *
 * On-chain volume/users are separate (see onchainMetrics) — that is source of truth.
 */

export type StoredEvent = {
  t: string;
  path: string | null;
  ref: string | null;
  meta: Record<string, unknown> | null;
  ts: number;
  ua: string | null;
};

const MEM_MAX = 2_000;
const REDIS_LIST = "gloam:traction:events";
const REDIS_COUNTERS = "gloam:traction:counters";
const REDIS_MAX = 5_000;

const mem: StoredEvent[] = [];
const memCounters = new Map<string, number>();

function redisConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(`${url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

export async function recordTractionEvent(ev: StoredEvent): Promise<void> {
  mem.unshift(ev);
  if (mem.length > MEM_MAX) mem.length = MEM_MAX;
  memCounters.set(ev.t, (memCounters.get(ev.t) ?? 0) + 1);

  if (!redisConfigured()) return;
  try {
    await redisCommand(["LPUSH", REDIS_LIST, JSON.stringify(ev)]);
    await redisCommand(["LTRIM", REDIS_LIST, 0, REDIS_MAX - 1]);
    await redisCommand(["HINCRBY", REDIS_COUNTERS, ev.t, 1]);
    await redisCommand(["HINCRBY", REDIS_COUNTERS, "total", 1]);
  } catch {
    /* non-fatal — memory still has it for this instance */
  }
}

export async function readTractionSummary(): Promise<{
  backend: "redis" | "memory";
  totalEvents: number;
  counters: Record<string, number>;
  recent: StoredEvent[];
}> {
  if (redisConfigured()) {
    try {
      const raw = (await redisCommand(["LRANGE", REDIS_LIST, 0, 99])) as
        | string[]
        | null;
      const countersRaw = (await redisCommand([
        "HGETALL",
        REDIS_COUNTERS,
      ])) as string[] | null;
      const counters: Record<string, number> = {};
      if (Array.isArray(countersRaw)) {
        for (let i = 0; i < countersRaw.length; i += 2) {
          const k = countersRaw[i];
          const v = Number(countersRaw[i + 1]);
          if (k) counters[k] = Number.isFinite(v) ? v : 0;
        }
      }
      const recent: StoredEvent[] = [];
      for (const row of raw ?? []) {
        try {
          recent.push(JSON.parse(row) as StoredEvent);
        } catch {
          /* skip */
        }
      }
      return {
        backend: "redis",
        totalEvents: counters.total ?? recent.length,
        counters,
        recent,
      };
    } catch {
      /* fall through */
    }
  }

  const counters: Record<string, number> = {};
  for (const [k, v] of memCounters) counters[k] = v;
  return {
    backend: "memory",
    totalEvents: mem.length,
    counters,
    recent: mem.slice(0, 100),
  };
}
