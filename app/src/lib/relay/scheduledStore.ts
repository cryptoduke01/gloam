/**
 * Where scheduled cash outs live in production: the same Redis the relay's
 * locks use (lib/relay/inflight, Upstash REST). A job outlives a redeploy and
 * is seen by every instance, so the cron finds it whichever one runs.
 *
 *   gloam:cashout:job:<id>                 the job, JSON, kept past its send time while live (liveTtlSec), JOB_DONE_TTL_SEC after
 *   gloam:cashout:due                      sorted set of live job ids by when the runner next looks (dueAt)
 *   gloam:cashout:nf:<chainId>:<tag>       the job scheduled for that spend: a keyed tag of its nullifier
 *   gloam:cashout:lock:<id>                a short lock while one run works on it
 *   gloam:cashout:reseal                   how far the re-seal has got, while an old key is kept
 *
 * With GLOAM_RELAY_JOB_KEY set, a record's proof, public inputs and webhook are
 * sealed (lib/relay/jobSeal), and the pointer's key carries a tag instead of the
 * nullifier, so reading Redis gives nobody a proof to send or a spend to watch.
 * What stays readable is what the queue needs: its id, chain, times and status. A
 * record written before that stays readable as it is and is sealed when it is
 * next saved; a pointer under a bare nullifier is still found, and expires with
 * its job. Without the key a dated job is refused here too, whatever the route did.
 *
 * A new job is written in one step (CREATE_SCRIPT): the spend's pointer is
 * taken only while no other job holds it, so two requests for one spend can't
 * both be saved.
 *
 * Without Redis there is nowhere shared to keep a job, so scheduling is refused
 * (scheduledStoreReady) rather than kept in one instance's memory, except on a
 * local dev server.
 */
import { randomUUID } from "crypto";
import type { Hex } from "viem";
import { redisConfigured } from "@/lib/tractionStore";
import { JobSealError, jobKeyReady, pointerTags, rotating, seal, sealedWithOldKey, unseal } from "./jobSeal";
import { JOB_DONE_TTL_SEC, dueAt, isLive, liveTtlSec, memoryJobStore, type CashOutJob, type JobStore } from "./scheduled";

const PREFIX = "gloam:cashout:";
const DUE = `${PREFIX}due`;
const RESEAL_AT = `${PREFIX}reseal`;
const REDIS_TIMEOUT_MS = 4_000;

async function redis(args: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error("redis: command failed");
  return json.result ?? null;
}

const RELEASE_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/**
 * KEYS: the spend's pointer, the job, the due queue. ARGV: id, job JSON, ttl,
 * due score, the id it may take over ("" for none). Returns the id that holds
 * the spend: ARGV[1] when written, else the other job's (nothing written).
 */
export const CREATE_SCRIPT = [
  'local cur = redis.call("GET", KEYS[1])',
  "if cur and cur ~= ARGV[1] and cur ~= ARGV[5] then return cur end",
  'redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])',
  'redis.call("ZADD", KEYS[3], ARGV[4], ARGV[1])',
  'redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])',
  "return ARGV[1]",
].join("\n");

function bareNfKey(chainId: number, nullifier: Hex) {
  return `${PREFIX}nf:${chainId}:${nullifier.toLowerCase()}`;
}

/** Where a spend's pointer is written: under its tag, or with no key as it always was. */
function nfKey(chainId: number, nullifier: Hex) {
  const [tag] = pointerTags(nullifier);
  return tag ? `${PREFIX}nf:${chainId}:${tag}` : bareNfKey(chainId, nullifier);
}

/** A job as it is kept: sealed when the relay holds a key. A dated job is never written in the clear. */
export function packJob(job: CashOutJob): string {
  if (!jobKeyReady()) {
    if (job.dated) throw new JobSealError("a dated job needs the job key");
    return JSON.stringify(job);
  }
  const { proof, root, nullifier, asset, to, amount, webhook, ...rest } = job;
  return JSON.stringify({ ...rest, sealed: seal(JSON.stringify({ proof, root, nullifier, asset, to, amount, webhook }), sealBound(job)) });
}

/** The seal belongs to this job on this chain, and can't be copied onto another. */
function sealBound(job: Pick<CashOutJob, "id" | "chainId">): string {
  return `${job.id}:${job.chainId}`;
}

/** A job from what is kept. Null when it isn't one; JobSealError when it is sealed and can't be opened. */
export function unpackJob(raw: string): CashOutJob | null {
  let stored: CashOutJob & { sealed?: string };
  try {
    stored = JSON.parse(raw) as typeof stored;
  } catch {
    return null;
  }
  if (typeof stored.sealed !== "string") return stored;
  const { sealed, ...rest } = stored;
  return { ...rest, ...(JSON.parse(unseal(sealed, sealBound(rest))) as Partial<CashOutJob>) };
}

function redisJobStore(): JobStore {
  return {
    async get(id) {
      const raw = await redis(["GET", `${PREFIX}job:${id}`]);
      return typeof raw === "string" ? unpackJob(raw) : null;
    },
    async put(job) {
      const live = isLive(job.status);
      // Worked out on every save: a job set for months ahead keeps all of it through a proof swap.
      const ttl = liveTtlSec(job, Date.now());
      await redis(["SET", `${PREFIX}job:${job.id}`, packJob(job), "EX", live ? ttl : JOB_DONE_TTL_SEC]);
      if (live) {
        await redis(["ZADD", DUE, dueAt(job), job.id]);
        await redis(["SET", nfKey(job.chainId, job.nullifier), job.id, "EX", ttl]);
      } else {
        await redis(["ZREM", DUE, job.id]);
      }
    },
    async create(job, replace) {
      const holder = await redis([
        "EVAL",
        CREATE_SCRIPT,
        3,
        nfKey(job.chainId, job.nullifier),
        `${PREFIX}job:${job.id}`,
        DUE,
        job.id,
        packJob(job),
        liveTtlSec(job, Date.now()),
        dueAt(job),
        replace ?? "",
      ]);
      if (typeof holder !== "string") throw new Error("redis: create gave no holder");
      return holder;
    },
    async due(now, limit) {
      const ids = await redis(["ZRANGEBYSCORE", DUE, "-inf", now, "LIMIT", 0, limit]);
      return Array.isArray(ids) ? ids.map(String) : [];
    },
    async byNullifier(chainId, nullifier) {
      const keys = [...pointerTags(nullifier).map((tag) => `${PREFIX}nf:${chainId}:${tag}`), bareNfKey(chainId, nullifier)];
      for (const key of keys) {
        const id = await redis(["GET", key]);
        if (typeof id !== "string") continue;
        const job = await this.get(id);
        if (job && isLive(job.status)) return id;
      }
      return null;
    },
    async lock(id, ttlSec) {
      const key = `${PREFIX}lock:${id}`;
      const token = randomUUID();
      if ((await redis(["SET", key, token, "NX", "EX", ttlSec])) !== "OK") return null;
      return async () => {
        try {
          await redis(["EVAL", RELEASE_SCRIPT, 1, key, token]);
        } catch {
          /* it expires on its own */
        }
      };
    },
    async forget(id) {
      await redis(["ZREM", DUE, id]);
    },
    async defer(id, at) {
      await redis(["ZADD", DUE, at, id]);
    },
    async reseal(limit) {
      if (!rotating()) return 0;
      const from = Number((await redis(["GET", RESEAL_AT])) ?? 0);
      const ids = await redis(["ZRANGE", DUE, from, from + limit - 1]);
      const list = Array.isArray(ids) ? ids.map(String) : [];
      let done = 0;
      for (const id of list) {
        // under the job's lock, or an older copy could land on a run's newer save
        const release = await this.lock(id, 30);
        if (!release) continue;
        try {
          const key = `${PREFIX}job:${id}`;
          const raw = await redis(["GET", key]);
          if (typeof raw !== "string") continue;
          const sealed = (JSON.parse(raw) as { sealed?: string }).sealed;
          if (sealed && !sealedWithOldKey(sealed)) continue;
          const job = unpackJob(raw);
          if (!job) continue;
          await redis(["SET", key, packJob(job), "KEEPTTL"]);
          done++;
        } catch {
          /* it stays as it is: the old key still opens it, and the next round tries again */
        } finally {
          await release();
        }
      }
      await redis(["SET", RESEAL_AT, list.length < limit ? 0 : from + limit, "EX", 3_600]);
      return done;
    },
  };
}

let local: JobStore | null = null;

/** Whether jobs can be kept somewhere every instance and the cron can read. */
export function scheduledStoreReady(): boolean {
  return redisConfigured() || process.env.NODE_ENV !== "production";
}

/** The job store: Redis when set, else (dev only) this process's memory. */
export function scheduledStore(): JobStore {
  if (redisConfigured()) return redisJobStore();
  local ??= memoryJobStore();
  return local;
}
