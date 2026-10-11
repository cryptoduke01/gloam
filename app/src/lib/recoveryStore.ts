/**
 * Encrypted recovery backups, server side. Server only.
 *
 * The browser encrypts its private balance (notes and receive key) with a key
 * that comes from a wallet signature or a passkey, and sends only the
 * ciphertext here, filed under an id derived from the same secret. The server
 * cannot read a backup or tell which wallet it belongs to. Replacing or
 * deleting one needs a write token that also comes from that secret; only its
 * hash is kept.
 *
 * Stored in the partner program's store (lib/partnersKv: Upstash Redis in
 * production, in-process locally) under its own prefix.
 */
import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { jsonOf, kv } from "./partnersKv";

const PREFIX = "gloam:recovery:v1:";
/** Ciphertext size cap, in base64 characters (about 380 KB of notes). */
export const MAX_BACKUP_CHARS = 512_000;
const HEX64 = /^[0-9a-f]{64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

type Stored = { w: string; c: string; n: number; t: number };

export type BackupView = { c: string; n: number; t: number };

export class RecoveryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RecoveryError";
  }
}

const keyFor = (id: string) => PREFIX + id;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isHex64(v: unknown): v is string {
  return typeof v === "string" && HEX64.test(v);
}

/** Whether a backup is filed under this id, without reading it. */
export async function backupExists(id: string): Promise<boolean> {
  const [n] = await kv([["EXISTS", keyFor(id)]]);
  return Number(n) > 0;
}

export async function readBackup(id: string): Promise<BackupView | null> {
  const [raw] = await kv([["GET", keyFor(id)]]);
  const s = jsonOf<Stored>(raw);
  return s ? { c: s.c, n: s.n, t: s.t } : null;
}

/**
 * Saves a backup. The first write sets the write token; later writes must
 * present the same token and a higher version number, so an older copy can
 * never replace a newer one.
 */
export async function writeBackup(p: { id: string; write: string; c: string; n: number }): Promise<{ n: number; t: number }> {
  if (typeof p.c !== "string" || !p.c || p.c.length > MAX_BACKUP_CHARS || !B64.test(p.c)) {
    throw new RecoveryError(400, "The backup is empty, too large or not encrypted.");
  }
  if (!Number.isSafeInteger(p.n) || p.n < 1) throw new RecoveryError(400, "Bad backup version.");

  const [raw] = await kv([["GET", keyFor(p.id)]]);
  const current = jsonOf<Stored>(raw);
  const w = sha256(p.write);
  if (current) {
    if (!sameHash(current.w, w)) throw new RecoveryError(403, "This backup belongs to a different key.");
    if (p.n <= current.n) throw new RecoveryError(409, "A newer backup is already saved.");
  }
  const next: Stored = { w, c: p.c, n: p.n, t: Date.now() };
  await kv([["SET", keyFor(p.id), JSON.stringify(next)]]);
  return { n: next.n, t: next.t };
}

/** Deletes a backup. Needs the write token; a missing backup counts as deleted. */
export async function deleteBackup(id: string, write: string): Promise<void> {
  const [raw] = await kv([["GET", keyFor(id)]]);
  const current = jsonOf<Stored>(raw);
  if (!current) return;
  if (!sameHash(current.w, sha256(write))) throw new RecoveryError(403, "This backup belongs to a different key.");
  await kv([["DEL", keyFor(id)]]);
}
