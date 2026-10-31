/**
 * Sealing a scheduled job at rest. A job holds a finished proof, and a dated one
 * holds it for months. Read access to Redis alone must not give anyone a proof
 * they could send, so what makes a job sendable (the proof and its public
 * inputs), and a top-up's webhook, are sealed with AES-256-GCM under a server
 * key before they are written (lib/relay/scheduledStore).
 *
 * The key is GLOAM_RELAY_JOB_KEY: 32 random bytes, as hex or base64
 * (`openssl rand -base64 32`). A seal is bound to its job's id and chain, so one
 * can't be copied onto another record.
 *
 * Without a usable key, dated jobs are refused and a cash out in a window is
 * stored as it always was, so turning this on never interrupts them. A job
 * stored in plain text stays readable for the rest of its life and is sealed the
 * next time it is saved.
 *
 * To rotate: put the new key in GLOAM_RELAY_JOB_KEY and the old one in
 * GLOAM_RELAY_JOB_KEYS_OLD (comma separated). New saves use the new key, and the
 * cron re-seals what is waiting a few jobs a pass (scheduledStore reseal). Keep
 * the old key until the cron logs nothing left to do, plus the 7 days a finished
 * job is kept.
 *
 * A seal that can't be opened throws JobSealError. It is never "no such job":
 * that would drop a waiting job from the queue, and tell the app it is gone.
 * If the key is lost for good, a sealed job can't send or be cancelled until its
 * record runs out, 3 days past its send time (JOB_TTL_SEC). The app then reads it
 * as gone and moves the note, so what is lost is the schedule, not the money.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

export const JOB_KEY_ENV = "GLOAM_RELAY_JOB_KEY";
export const OLD_JOB_KEYS_ENV = "GLOAM_RELAY_JOB_KEYS_OLD";

/** The seal's format: `gj1.<key id>.<iv>.<ciphertext>.<tag>`. */
const VERSION = "gj1";
const IV_BYTES = 12;

type JobKey = { id: string; bytes: Buffer };

/** A sealed job could not be opened, or could not be sealed. Nothing was read or written. */
export class JobSealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobSealError";
  }
}

function parseKey(raw: string): JobKey | null {
  const s = raw.trim();
  const bytes = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
  if (bytes.length !== 32) return null;
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 8), bytes };
}

let warned = false;

function currentKey(): JobKey | null {
  const raw = process.env[JOB_KEY_ENV]?.trim();
  if (!raw) return null;
  const key = parseKey(raw);
  if (!key && !warned) {
    warned = true;
    console.warn("gloam_relay_job_key_invalid", JSON.stringify({ want: "32 bytes, hex or base64" }));
  }
  return key;
}

function oldKeys(): JobKey[] {
  return (process.env[OLD_JOB_KEYS_ENV] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseKey)
    .filter((k): k is JobKey => k !== null);
}

/** Whether jobs can be sealed: the key is set and is 32 bytes. */
export function jobKeyReady(): boolean {
  return currentKey() !== null;
}

/** Whether an old key is still being kept, so what was sealed with it should be sealed again. */
export function rotating(): boolean {
  return currentKey() !== null && oldKeys().length > 0;
}

/** Seals `plain` under the current key, bound to `bound`. */
export function seal(plain: string, bound: string): string {
  const key = currentKey();
  if (!key) throw new JobSealError(`${JOB_KEY_ENV} is not set`);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, iv);
  cipher.setAAD(Buffer.from(bound, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, key.id, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** Opens a seal with whichever key made it. Throws JobSealError when it can't be opened. */
export function unseal(sealed: string, bound: string): string {
  const [version, id, iv, body, tag, extra] = sealed.split(".");
  if (version !== VERSION || !id || !iv || !body || !tag || extra !== undefined) throw new JobSealError("not a job seal");
  const key = [currentKey(), ...oldKeys()].find((k) => k?.id === id);
  if (!key) throw new JobSealError("no key for this seal");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(bound, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new JobSealError("this seal does not open");
  }
}

/** Whether a seal was made with a key other than the current one. */
export function sealedWithOldKey(sealed: string): boolean {
  const key = currentKey();
  return Boolean(key) && sealed.split(".")[1] !== key!.id;
}

function tagWith(key: JobKey, value: string): string {
  // its own key, so a tag says nothing about the key that seals
  const derived = createHmac("sha256", key.bytes).update("gloam-job-pointer").digest();
  return createHmac("sha256", derived).update(value.toLowerCase()).digest("hex").slice(0, 40);
}

/**
 * What stands in for a nullifier in a Redis key: a job's spend pointer would
 * otherwise show it in the clear. The current key's tag first, then the tag under
 * each old key. Empty without a key.
 */
export function pointerTags(value: string): string[] {
  const key = currentKey();
  return key ? [key, ...oldKeys()].map((k) => tagWith(k, value)) : [];
}
