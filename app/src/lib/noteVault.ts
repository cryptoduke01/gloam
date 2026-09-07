"use client";

/**
 * Encrypted-at-rest store for shield notes (audit M-1).
 *
 * Note secrets used to sit in localStorage as plaintext JSON. This module keeps
 * the working copy in memory and persists it to localStorage encrypted with
 * AES-GCM under a non-extractable device key held in IndexedDB. A localStorage
 * dump, backup, or shared-browser snoop now yields ciphertext, not spend keys.
 *
 * The public accessors stay synchronous (components read notes during render):
 * the cache loads a legacy plaintext blob synchronously and is filled from the
 * encrypted blob by an async unlock that the notes hook triggers on mount.
 * Persistence always waits for that unlock first, so a write can never overwrite
 * the encrypted store before it has been merged into the cache.
 */
import type { LocalNote } from "./shield";

export const NOTES_KEY = "gloam.shield.notes.v1";
const ENC_PREFIX = "gloamenc1:";
const DB_NAME = "gloam-vault";
const STORE = "keys";
const KEY_ID = "note-aes-256";

let cache: LocalNote[] = [];
let unlockPromise: Promise<void> | null = null;
let keyPromise: Promise<CryptoKey> | null = null;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function parseNotes(json: string): LocalNote[] {
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? (a as LocalNote[]) : [];
  } catch {
    return [];
  }
}

/** Get-or-create a non-extractable AES-GCM key in IndexedDB. */
function loadKey(): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const getReq = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY_ID);
      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        const existing = getReq.result as CryptoKey | undefined;
        if (existing) return resolve(existing);
        crypto.subtle
          .generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
          .then((key) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(key, KEY_ID);
            tx.oncomplete = () => resolve(key);
            tx.onerror = () => reject(tx.error);
          })
          .catch(reject);
      };
    };
  });
}
function getKey(): Promise<CryptoKey> {
  return (keyPromise ??= loadKey());
}

async function encrypt(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain))
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return ENC_PREFIX + b64(out);
}
async function decrypt(blob: string): Promise<string> {
  const key = await getKey();
  const raw = unb64(blob.slice(ENC_PREFIX.length));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function writeBlob(): Promise<void> {
  const enc = await encrypt(JSON.stringify(cache));
  localStorage.setItem(NOTES_KEY, enc);
}

// Synchronous bootstrap: a legacy plaintext blob is loaded now so reads work
// before the async unlock; an encrypted blob waits for unlock to decrypt.
function initSync() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(NOTES_KEY);
  if (raw && !raw.startsWith(ENC_PREFIX)) cache = parseNotes(raw);
}
initSync();

/** Ensure the encrypted store is decrypted (or legacy plaintext migrated) into the cache. */
export function unlockNoteVault(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return (unlockPromise ??= (async () => {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw && raw.startsWith(ENC_PREFIX)) {
      try {
        const disk = parseNotes(await decrypt(raw));
        // Merge disk into cache; any pre-unlock write (already in cache) wins by id.
        const byId = new Map<string, LocalNote>();
        for (const n of disk) byId.set(n.id, n);
        for (const n of cache) byId.set(n.id, n);
        cache = [...byId.values()];
      } catch {
        // Wrong key or corrupt blob: keep the cache, never wipe the ciphertext.
      }
    } else if (raw) {
      // Legacy plaintext already in cache from initSync: re-persist encrypted.
      await writeBlob();
    } else {
      await getKey();
    }
  })());
}

/** Re-read the encrypted blob from disk into the cache (cross-tab updates). */
export async function syncFromDisk(): Promise<void> {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(NOTES_KEY);
  if (raw && raw.startsWith(ENC_PREFIX)) {
    try {
      cache = parseNotes(await decrypt(raw));
    } catch {
      /* ignore */
    }
  } else if (raw) {
    cache = parseNotes(raw);
  }
}

/** All notes in the in-memory cache (unfiltered). */
export function getAllNotes(): LocalNote[] {
  return cache;
}

/** Replace the cache and persist it encrypted (after ensuring unlock). */
export function setAllNotes(next: LocalNote[]): void {
  cache = next;
  if (typeof window === "undefined") return;
  void (async () => {
    await unlockNoteVault();
    await writeBlob();
  })();
}
