/**
 * Claim links: gloam.trade/claim?net=<network>#claim=<code>, the same links the
 * Gloam app makes and opens (app/src/lib/claimLink.ts), character for character.
 *
 * The code is a note package (gloam1.<base64url JSON>), so a claim link is a
 * bearer secret: whoever holds it can claim the money. That is why this plugin
 * never puts one in a function's feedback (which goes to the GAME planner) or
 * in a log. It goes to the owner's own code (onClaimLink), or sealed to a Gloam
 * address so only that address can open it.
 *
 * In the URL the dot after the prefix is written "=", and "-", "_" and "." in
 * the body "=1", "=2" and "=3", so chat apps keep the whole link clickable.
 */
import { decodeNotePackage, NOTE_PACKAGE_PREFIX, type NotePackage } from "@gloamtrade/sdk";

export const CLAIM_ORIGIN = "https://www.gloam.trade";

const LINK_ESCAPE: Record<string, string> = { "-": "=1", _: "=2", ".": "=3" };
const LINK_UNESCAPE: Record<string, string> = { "1": "-", "2": "_", "3": "." };

function linkSafe(code: string): string {
  const c = code.trim();
  const m = c.match(/^(gloam1e|gloam2t|gloam1)\.([A-Za-z0-9_\-.]+)$/);
  if (m) return `${m[1]}=${m[2]!.replace(/[-_.]/g, (ch) => LINK_ESCAPE[ch]!)}`;
  return encodeURIComponent(c).replace(/\./g, "%2E");
}

/** A code as a link wrote it, back to the code. Older forms ("gloam1-…", "gloam1.…") still read. */
export function codeFromLinkText(s: string): string {
  const eq = s.match(/^(gloam1e|gloam2t|gloam1)=(.*)$/s);
  if (eq) return `${eq[1]}.${eq[2]!.replace(/=([123])/g, (_, d: string) => LINK_UNESCAPE[d]!)}`;
  return s.replace(/^(gloam1e|gloam2t|gloam1)-/, "$1.");
}

/** The shareable claim link for a code on a network ("base", "robinhood-mainnet"). */
export function claimLinkFor(code: string, networkKey: string, origin = CLAIM_ORIGIN): string {
  return `${origin.replace(/\/+$/, "")}/claim?net=${encodeURIComponent(networkKey)}#claim=${linkSafe(code)}`;
}

/**
 * The note package and network inside a claim link, or inside a bare code
 * (gloam1.…). Throws a plain reason for anything else, including a locked code
 * (gloam1e., which needs its passphrase in the Gloam app).
 */
export function readClaimLink(input: string): { pack: NotePackage; networkKey: string | null } {
  const s = input.trim();
  let code = s;
  let networkKey: string | null = null;
  if (/^https?:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      throw new Error("That is not a link.");
    }
    networkKey = url.searchParams.get("net");
    const hash = url.hash.startsWith("#claim=") ? url.hash.slice("#claim=".length) : "";
    if (!hash) throw new Error("That link has no claim code after #claim=.");
    try {
      code = codeFromLinkText(decodeURIComponent(hash).trim());
    } catch {
      throw new Error("The claim code in that link is damaged.");
    }
  } else {
    code = codeFromLinkText(s);
  }
  if (code.startsWith("gloam1e.")) {
    throw new Error("That claim code is locked with a passphrase. Open it in the Gloam app, which asks for the passphrase.");
  }
  if (!code.startsWith(NOTE_PACKAGE_PREFIX)) throw new Error("That is not a Gloam claim link or code.");
  return { pack: decodeNotePackage(code), networkKey };
}

/** True when text carries a claim code (used to keep them out of feedback and logs). */
export function looksLikeClaimCode(text: string): boolean {
  return /#claim=|gloam1e?[.=-][A-Za-z0-9_=-]{16,}/.test(text);
}
