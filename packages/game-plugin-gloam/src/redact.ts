/**
 * The last guard before text leaves the plugin: function feedback goes to the
 * GAME planner (Virtuals' hosted LLM), and logs go wherever the agent's logger
 * sends them. Neither may carry a secret.
 *
 * The functions are written to never put one there. This catches mistakes:
 * every secret the plugin handles (note secrets, the agent's key, the note
 * store key, receive keys, an RPC URL that may carry an API key) is registered
 * here, and any text containing one is redacted, along with anything shaped
 * like a claim code or a note package. A transaction hash and a 32-byte secret
 * look alike, so shape alone cannot tell them apart; exact matches against
 * known secrets can.
 *
 * Secrets and claim codes are also caught when they are wrapped: a hex secret
 * in decimal or without its leading zeros, a claim link URL-encoded (once or
 * more), and a claim code or link inside base64 or base64url.
 */
import { looksLikeClaimCode } from "./claimLinks.js";

const known = new Set<string>();

function remember(v: string) {
  if (v.length >= 16) known.add(v.toLowerCase());
}

/** Remember a secret so it can never be written out (and its decimal and unpadded hex forms). */
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
  }
}

/**
 * Remember an RPC URL: providers put API keys in the path or the query
 * ("/v2/<key>", "?apikey=<key>"), and RPC errors quote the URL.
 */
export function registerUrlSecret(url: string | null | undefined) {
  const u = url?.trim();
  if (!u) return;
  remember(u);
  remember(u.replace(/\/+$/, ""));
  try {
    const parsed = new URL(u);
    remember(`${parsed.host}${parsed.pathname}${parsed.search}`);
    for (const part of parsed.pathname.split("/")) remember(decodeURIComponent(part));
    for (const [, value] of parsed.searchParams) remember(value);
    if (parsed.password) remember(decodeURIComponent(parsed.password));
    if (parsed.username) remember(decodeURIComponent(parsed.username));
  } catch {
    /* not a URL: the whole string is remembered */
  }
}

export const REDACTED = "[redacted]";

function holdsKnown(text: string): boolean {
  if (!known.size) return false;
  const low = text.toLowerCase();
  for (const s of known) if (low.includes(s)) return true;
  return false;
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

/** True when a run of URL or base64 characters hides a secret or a claim code once decoded. */
function hidesSecret(run: string, depth = 0): boolean {
  if (looksLikeClaimCode(run) || NOTE_JSON.test(run) || holdsKnown(run)) return true;
  if (depth >= 3) return false;
  if (/%[0-9a-fA-F]{2}/.test(run)) {
    try {
      const d = decodeURIComponent(run);
      if (d !== run && hidesSecret(d, depth + 1)) return true;
    } catch {
      /* not percent-encoding after all */
    }
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
  for (const s of known) {
    const low = out.toLowerCase();
    if (!low.includes(s)) continue;
    // Every hit replaced, whatever its case.
    let rebuilt = "";
    let from = 0;
    let i: number;
    while ((i = low.indexOf(s, from)) >= 0) {
      rebuilt += out.slice(from, i) + REDACTED;
      from = i + s.length;
    }
    out = rebuilt + out.slice(from);
  }
  if (looksLikeClaimCode(out)) {
    out = out
      .replace(/https?:\/\/\S*#claim=\S*/g, REDACTED)
      .replace(/#claim=\S*/g, REDACTED)
      .replace(/gloam1e?[.=-][A-Za-z0-9_=-]{16,}/g, REDACTED);
  }
  // Wrapped forms: percent-encoded links, base64 around a code or a link.
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
