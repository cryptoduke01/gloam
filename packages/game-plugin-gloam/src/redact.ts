/**
 * The last guard before text leaves the plugin: function feedback goes to the
 * GAME planner (Virtuals' hosted LLM), and logs go wherever the agent's logger
 * sends them. Neither may carry a secret.
 *
 * The functions are written to never put one there. This catches mistakes:
 * every secret the plugin handles (note secrets, the agent's key, the note
 * store key, receive keys, the API key part of an RPC URL) is registered here,
 * and any text containing one is redacted, along with anything shaped like a
 * claim code or a note package. A transaction hash and a 32-byte secret look
 * alike, so shape alone cannot tell them apart; exact matches against known
 * secrets can.
 *
 * Secrets and claim codes are also caught when they are wrapped: a hex secret
 * in decimal, without its leading zeros, as raw bytes in base64 or base64url,
 * as a byte array, or in hex split by spaces; a claim link URL-encoded (once or
 * more); a claim code or link inside base64, base64url or hex; and a note
 * package written out as JSON, whose secret is removed even when it was never
 * registered.
 */
import { looksLikeClaimCode } from "./claimLinks.js";

/** Every known form, lowercased, indexed by its first PREFIX characters so a scan is one pass over the text. */
const PREFIX = 16;
const known = new Set<string>();
const byPrefix = new Map<string, string[]>();

function remember(v: string) {
  if (v.length < PREFIX) return;
  const low = v.toLowerCase();
  if (known.has(low)) return;
  known.add(low);
  const k = low.slice(0, PREFIX);
  const list = byPrefix.get(k);
  if (list) list.push(low);
  else byPrefix.set(k, [low]);
}

/** Remember a secret so it can never be written out, in its other common forms too. */
export function registerSecret(value: string | null | undefined) {
  const v = value?.trim();
  if (!v || v.length < 16) return;
  remember(v);
  const hex = /^0x[0-9a-fA-F]+$/.test(v) ? v.slice(2) : /^[0-9a-fA-F]{32,}$/.test(v) ? v : null;
  if (v.startsWith("0x")) remember(v.slice(2));
  if (hex) {
    const n = BigInt(`0x${hex}`);
    remember(n.toString(10));
    remember(n.toString(16));
    remember(`0x${n.toString(16)}`);
    // The raw bytes, as base64 and base64url (a 32-byte secret is 43 or 44 characters).
    const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
    remember(bytes.toString("base64"));
    remember(bytes.toString("base64").replace(/=+$/, ""));
    remember(bytes.toString("base64url"));
  }
}

/**
 * Remember the secret parts of an RPC URL: providers put API keys in the path
 * or the query ("/v2/<key>", "?apikey=<key>") or the user info, and RPC errors
 * quote the URL. A URL with none of those (a public endpoint) is left alone, so
 * messages that name it still read.
 */
export function registerUrlSecret(url: string | null | undefined) {
  const u = url?.trim();
  if (!u) return;
  try {
    const parsed = new URL(u);
    for (const part of parsed.pathname.split("/")) {
      try {
        remember(decodeURIComponent(part));
      } catch {
        remember(part);
      }
    }
    for (const [, value] of parsed.searchParams) remember(value);
    if (parsed.password) remember(decodeURIComponent(parsed.password));
    if (parsed.username) remember(decodeURIComponent(parsed.username));
  } catch {
    // Not a URL: the whole string is remembered.
    remember(u);
  }
}

export const REDACTED = "[redacted]";

/** Where in `low` (already lowercased) the first known form starts at or after `from`, and the longest one starting there. */
function findKnown(low: string, from = 0): { at: number; len: number } | null {
  if (!known.size) return null;
  for (let i = from; i + PREFIX <= low.length; i++) {
    const list = byPrefix.get(low.slice(i, i + PREFIX));
    if (!list) continue;
    let len = 0;
    for (const s of list) if (s.length > len && low.startsWith(s, i)) len = s.length;
    if (len) return { at: i, len };
  }
  return null;
}

function holdsKnown(text: string): boolean {
  return findKnown(text.toLowerCase()) !== null;
}

/** A note package's JSON (what a claim code carries once its base64 is undone). */
const NOTE_JSON = /gloam-private-note/;

function b64decode(s: string): string | null {
  const std = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (std.length < 16) return null;
  try {
    return Buffer.from(std, "base64").toString("latin1");
  } catch {
    return null;
  }
}

/** True when a run of URL, base64 or hex characters hides a secret or a claim code once decoded. */
function hidesSecret(run: string, depth = 0): boolean {
  if (looksLikeClaimCode(run) || NOTE_JSON.test(run) || holdsKnown(run)) return true;
  if (depth >= 4) return false;
  if (/%[0-9a-fA-F]{2}/.test(run)) {
    try {
      const d = decodeURIComponent(run);
      if (d !== run && hidesSecret(d, depth + 1)) return true;
    } catch {
      /* not percent-encoding after all */
    }
  }
  // hex of a code or a link (even length, at least 32 characters)
  for (const m of run.matchAll(/[0-9a-fA-F]{32,}/g)) {
    const h = m[0].length % 2 ? m[0].slice(1) : m[0];
    if (hidesSecret(Buffer.from(h, "hex").toString("latin1"), depth + 1)) return true;
  }
  for (const m of run.matchAll(/[A-Za-z0-9+/_-]{20,}={0,2}/g)) {
    const b = m[0];
    // base64 inside a longer blob need not start on a 4-character boundary
    for (let off = 0; off < 4 && off < b.length - 16; off++) {
      const d = b64decode(b.slice(off));
      if (d && hidesSecret(d, depth + 1)) return true;
    }
  }
  return false;
}

/** The text with every known secret and every claim code or note package removed. */
export function redact(text: string): string {
  let out = text;
  // Known secrets, every hit, whatever its case.
  {
    const low = out.toLowerCase();
    let rebuilt = "";
    let from = 0;
    let hit = findKnown(low);
    while (hit) {
      rebuilt += out.slice(from, hit.at) + REDACTED;
      from = hit.at + hit.len;
      hit = findKnown(low, from);
    }
    out = rebuilt + out.slice(from);
  }
  if (looksLikeClaimCode(out)) {
    out = out
      .replace(/https?:\/\/\S*#claim=\S*/g, REDACTED)
      .replace(/#claim=\S*/g, REDACTED)
      .replace(/gloam1e?[.=-][A-Za-z0-9_=-]{16,}/g, REDACTED);
  }
  // A note package written out as JSON: its secret goes, registered or not (escaped JSON too).
  if (NOTE_JSON.test(out)) {
    out = out.replace(/(\\*"(?:k|secret)\\*"\s*:\s*\\*")0x[0-9a-fA-F]{8,}/g, `$1${REDACTED}`);
  }
  // Bytes written as a list of numbers ([26, 26, ...]), and hex split by spaces.
  out = out.replace(/\[?\s*\b\d{1,3}\b(?:\s*,\s*\b\d{1,3}\b){15,}\s*\]?/g, (list) => {
    const nums = list.match(/\d{1,3}/g)!.map(Number);
    if (nums.some((n) => n > 255)) return list;
    const bytes = Buffer.from(nums);
    return holdsKnown(bytes.toString("hex")) || hidesSecret(bytes.toString("latin1")) ? REDACTED : list;
  });
  out = out.replace(/(?:[0-9a-fA-F]{2,}[ \t]){3,}[0-9a-fA-F]{2,}/g, (spaced) => (holdsKnown(spaced.replace(/\s+/g, "")) ? REDACTED : spaced));
  // Wrapped forms: percent-encoded links, base64 or hex around a code or a link.
  out = out.replace(/[A-Za-z0-9+/=_%.:#?&~-]{24,}/g, (run) => (run !== REDACTED && hidesSecret(run) ? REDACTED : run));
  return out;
}

/** True when text holds anything redact() would remove. */
export function holdsSecret(text: string): boolean {
  return redact(text) !== text;
}

/**
 * An error as one short line that is safe to show: viem's shortMessage (never
 * the URL, request body or version lines it adds below), redacted.
 */
export function safeErrorMessage(e: unknown): string {
  const o = e as { shortMessage?: unknown; message?: unknown } | null;
  const raw =
    o && typeof o === "object" && typeof o.shortMessage === "string" && o.shortMessage
      ? o.shortMessage
      : e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : String(e);
  const line = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "Unknown error.";
  const out = redact(line);
  return out.length > 300 ? `${out.slice(0, 297)}...` : out;
}
