/**
 * Who a proof is for, as text a person reads. The label is sealed into the
 * proof, so it is cleaned before proving and cleaned again before it is shown:
 * invisible characters and direction overrides could make a sealed label read
 * as a different name on the verify page.
 */

/** Longest label a proof can carry. */
export const MAX_LABEL = 80;

// Format characters (zero width, joiners, bidi marks and overrides, BOM, soft
// hyphen, tag characters) and control characters other than whitespace.
const HIDDEN = /[\p{Cf}\u0000-\u0008\u000E-\u001F\u007F-\u009F]/gu;

/** The label with hidden characters removed, trimmed and single spaced. */
export function plainLabel(raw: string): string {
  return raw.replace(HIDDEN, "").replace(/\s+/g, " ").trim();
}

/** The label as the verify page shows it: plain, and cut at MAX_LABEL characters. */
export function displayLabel(raw: unknown): string {
  const v = plainLabel(typeof raw === "string" ? raw : String(raw));
  const chars = Array.from(v);
  return chars.length > MAX_LABEL ? `${chars.slice(0, MAX_LABEL).join("")}…` : v;
}

/** True when the label was sealed exactly as the app would write it. */
export function isPlainLabel(raw: unknown): boolean {
  return typeof raw === "string" && raw.length > 0 && raw === plainLabel(raw) && Array.from(raw).length <= MAX_LABEL;
}
