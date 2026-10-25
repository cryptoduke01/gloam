/**
 * The last guard before text leaves the plugin: function feedback goes to the
 * GAME planner (Virtuals' hosted LLM), and logs go wherever the agent's logger
 * sends them. Neither may carry a secret.
 *
 * The functions are written to never put one there. This catches mistakes:
 * every secret the plugin handles (note secrets, the agent's key, the note
 * store key, receive keys) is registered here, and any text containing one is
 * redacted, along with anything shaped like a claim code or a note package.
 * A transaction hash and a 32-byte secret look alike, so shape alone cannot
 * tell them apart; exact matches against known secrets can.
 */
import { looksLikeClaimCode } from "./claimLinks.js";

const known = new Set<string>();

/** Remember a secret so it can never be written out. */
export function registerSecret(value: string | null | undefined) {
  const v = value?.trim();
  if (!v || v.length < 16) return;
  known.add(v.toLowerCase());
  if (v.startsWith("0x")) known.add(v.slice(2).toLowerCase());
}

export const REDACTED = "[redacted]";

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
  return out;
}

/** True when text holds anything redact() would remove. */
export function holdsSecret(text: string): boolean {
  return redact(text) !== text;
}
