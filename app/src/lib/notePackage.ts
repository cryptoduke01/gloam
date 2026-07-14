/**
 * Portable **payment tickets** for Gloam vault pay.
 * Not a traditional address transfer — bearer secret for a vault note.
 * - Compact: gloam1.<base64url>
 * - Optional passphrase: gloam1e.<base64url> (AES-GCM)
 * Still accepts legacy JSON for older shares.
 */

import type { Address, Hex } from "viem";
import { NATIVE_ASSET } from "./shield";

export type NotePackage = {
  v: 1;
  type: "gloam-private-note";
  scheme: "poseidon";
  pool: Address;
  asset: Address;
  amountWei: string;
  secret: Hex;
  commitment: Hex;
  message?: string;
};

const PREFIX_PLAIN = "gloam1.";
const PREFIX_ENC = "gloam1e.";

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

/** Fresh ArrayBuffer-backed view — satisfies strict BufferSource typing (TS 5.x). */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export function buildNotePackage(args: {
  pool: Address;
  asset?: Address;
  amountWei: string;
  secret: Hex;
  commitment: Hex;
}): NotePackage {
  return {
    v: 1,
    type: "gloam-private-note",
    scheme: "poseidon",
    pool: args.pool,
    asset: args.asset ?? NATIVE_ASSET,
    amountWei: args.amountWei,
    secret: args.secret,
    commitment: args.commitment,
    message: "Gloam payment — import under Move → Receive. Keep secret.",
  };
}

/** Compact share string (no passphrase). */
export function encodeNotePackage(pack: NotePackage): string {
  const json = JSON.stringify({
    v: pack.v,
    t: pack.type,
    s: pack.scheme,
    p: pack.pool,
    a: pack.asset,
    w: pack.amountWei,
    k: pack.secret,
    c: pack.commitment,
  });
  return PREFIX_PLAIN + b64urlEncode(utf8(json));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    buf(utf8(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: buf(salt),
      iterations: 120_000,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt package with a shared passphrase (sender tells recipient the phrase). */
export async function encodeNotePackageEncrypted(
  pack: NotePackage,
  passphrase: string
): Promise<string> {
  if (!passphrase.trim()) throw new Error("Passphrase required");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase.trim(), salt);
  const plain = buf(utf8(JSON.stringify(pack)));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, plain)
  );
  const out = new Uint8Array(salt.length + iv.length + cipher.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(cipher, 28);
  return PREFIX_ENC + b64urlEncode(out);
}

function expandCompact(obj: Record<string, unknown>): NotePackage | null {
  if (obj.t !== "gloam-private-note" && obj.type !== "gloam-private-note") {
    // compact form uses t/s/p/a/w/k/c
    if (obj.t && obj.k && obj.w) {
      return {
        v: 1,
        type: "gloam-private-note",
        scheme: "poseidon",
        pool: String(obj.p) as Address,
        asset: (String(obj.a || NATIVE_ASSET) as Address),
        amountWei: String(obj.w),
        secret: String(obj.k) as Hex,
        commitment: String(obj.c || "0x") as Hex,
      };
    }
    return null;
  }
  return {
    v: 1,
    type: "gloam-private-note",
    scheme: "poseidon",
    pool: String(obj.pool || obj.p) as Address,
    asset: String(obj.asset || obj.a || NATIVE_ASSET) as Address,
    amountWei: String(obj.amountWei || obj.w),
    secret: String(obj.secret || obj.k) as Hex,
    commitment: String(obj.commitment || obj.c || "0x") as Hex,
    message: obj.message ? String(obj.message) : undefined,
  };
}

/**
 * Parse legacy JSON, gloam1.*, or gloam1e.* (needs passphrase).
 */
export async function decodeNotePackage(
  input: string,
  passphrase?: string
): Promise<NotePackage> {
  const s = input.trim();

  if (s.startsWith(PREFIX_ENC)) {
    if (!passphrase?.trim()) {
      throw new Error("This payment is locked — enter the passphrase from the sender.");
    }
    const raw = b64urlDecode(s.slice(PREFIX_ENC.length));
    if (raw.length < 29) throw new Error("Corrupt locked payment.");
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const cipher = raw.slice(28);
    const key = await deriveKey(passphrase.trim(), salt);
    try {
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: buf(iv) },
          key,
          buf(cipher)
        )
      );
      const pack = expandCompact(JSON.parse(utf8Decode(plain)) as Record<string, unknown>);
      if (!pack?.secret || !pack.amountWei) throw new Error("Invalid payment.");
      return pack;
    } catch {
      throw new Error("Wrong passphrase or corrupt payment.");
    }
  }

  if (s.startsWith(PREFIX_PLAIN)) {
    const plain = utf8Decode(b64urlDecode(s.slice(PREFIX_PLAIN.length)));
    const pack = expandCompact(JSON.parse(plain) as Record<string, unknown>);
    if (!pack?.secret || !pack.amountWei) throw new Error("Invalid payment package.");
    return pack;
  }

  // Legacy pretty JSON
  if (s.startsWith("{")) {
    const pack = expandCompact(JSON.parse(s) as Record<string, unknown>);
    if (!pack?.secret || !pack.amountWei) {
      throw new Error("Not a valid Gloam payment package.");
    }
    return pack;
  }

  throw new Error("Paste a Gloam payment (gloam1… or the full package).");
}

export function isEncryptedPackage(input: string): boolean {
  return input.trim().startsWith(PREFIX_ENC);
}

export function formatAmountEth(wei: string): string {
  try {
    const n = Number(wei) / 1e18;
    if (!Number.isFinite(n)) return wei;
    if (n === 0) return "0";
    if (n < 0.0001) return "<0.0001";
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return wei;
  }
}
