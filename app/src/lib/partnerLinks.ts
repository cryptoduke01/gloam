/**
 * Partner link codes: what a pay link or a swap link carries as `p=<code>` so a
 * payment or swap opened from a partner's link is counted to that partner
 * (lib/partnerAttribution). Server only.
 *
 * A code is 20 random letters and digits (about 119 bits) made here, stored
 * here and mapped to one partner account. A name in a link (`name`, `ref`) is
 * whatever its maker typed and counts for nothing; only a code this store issued,
 * still live, does. A code is not a secret: it sits in every link the partner
 * shares. It only says which partner a link is from. A revoked or expired code
 * counts for nothing from then on; what it counted before stays counted.
 *
 * Storage (lib/partnersKv), under gloam:partners:v1:
 *   link:<code>        the code's record (JSON)
 *   links:<partnerId>  set of the partner's codes
 */
import { randomInt } from "crypto";
import { cleanText } from "./paymentNote";
import { jsonOf, k, kv, kv1, type KvCommand } from "./partnersKv";
import { getPartner, PartnerError, type Partner } from "./partners";
import { isLinkCodeShape, LINK_CODE_LENGTH } from "./partnerCode";

export { isLinkCodeShape, LINK_CODE_LENGTH };
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Live codes a partner may hold at once. */
export const MAX_LIVE_CODES = 20;
export const LINK_LABEL_MAX = 40;
/** The longest a code can be set to last, in days; no expiry when none is asked for. */
export const MAX_EXPIRY_DAYS = 730;

export type LinkCode = {
  code: string;
  partnerId: string;
  /** What the partner calls it ("Fund button", "Swap page"). */
  label: string;
  createdAt: number;
  /** Who made it. */
  createdBy: "partner" | "admin";
  /** ms; null: no expiry. */
  expiresAt: number | null;
  revokedAt: number | null;
};

/** A new code: uniform over the alphabet (no modulo bias). */
export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function linkCodeState(c: LinkCode, now = Date.now()): "live" | "revoked" | "expired" {
  if (c.revokedAt != null) return "revoked";
  if (c.expiresAt != null && c.expiresAt <= now) return "expired";
  return "live";
}

/** What a code looks like over the wire, to its partner or an admin. */
export function linkCodeView(c: LinkCode, now = Date.now()) {
  return { ...c, state: linkCodeState(c, now) };
}

export async function getLinkCode(code: string): Promise<LinkCode | null> {
  if (!isLinkCodeShape(code)) return null;
  return jsonOf<LinkCode>(await kv1(["GET", k("link", code)]));
}

/** Every code a partner holds, newest first, revoked and expired ones included. */
export async function listLinkCodes(partnerId: string): Promise<LinkCode[]> {
  const codes = (await kv1(["SMEMBERS", k("links", partnerId)])) as string[];
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const raw = await kv(codes.map((c) => ["GET", k("link", c)] as KvCommand));
  return raw
    .map((r) => jsonOf<LinkCode>(r))
    .filter((c): c is LinkCode => Boolean(c && c.partnerId === partnerId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Issues a new code for a partner. `expiresInDays`: whole days, 1 to MAX_EXPIRY_DAYS, or none. */
export async function issueLinkCode(args: {
  partnerId: string;
  label?: unknown;
  expiresInDays?: unknown;
  by: "partner" | "admin";
  now?: number;
}): Promise<LinkCode> {
  const now = args.now ?? Date.now();
  if (!(await getPartner(args.partnerId))) throw new PartnerError("No partner with that id.", 404, "not_found");
  const label = cleanText(typeof args.label === "string" ? args.label : "", LINK_LABEL_MAX);
  let expiresAt: number | null = null;
  if (args.expiresInDays != null && args.expiresInDays !== "") {
    const d = typeof args.expiresInDays === "string" ? Number(args.expiresInDays) : args.expiresInDays;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > MAX_EXPIRY_DAYS) {
      throw new PartnerError(`Expiry must be a whole number of days from 1 to ${MAX_EXPIRY_DAYS}, or none.`, 400, "bad_expiry");
    }
    expiresAt = now + d * 86_400_000;
  }
  const live = (await listLinkCodes(args.partnerId)).filter((c) => linkCodeState(c, now) === "live");
  if (live.length >= MAX_LIVE_CODES) {
    throw new PartnerError(`An account can hold ${MAX_LIVE_CODES} live link codes. Revoke one first.`, 400, "too_many_codes");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const c: LinkCode = {
      code: generateLinkCode(),
      partnerId: args.partnerId,
      label,
      createdAt: now,
      createdBy: args.by,
      expiresAt,
      revokedAt: null,
    };
    const [set] = await kv([
      ["SET", k("link", c.code), JSON.stringify(c), "NX"],
      ["SADD", k("links", c.partnerId), c.code],
    ]);
    if (set === "OK") return c;
    // never happens at 119 bits; if it did, the set holds a code that is someone else's, so take it back out
    await kv1(["SREM", k("links", c.partnerId), c.code]);
  }
  throw new PartnerError("Could not make a code. Try again.", 500, "internal");
}

/**
 * Revokes a code. Only the partner it belongs to can, or an admin (no partnerId).
 * Revoking twice keeps the first time. Null when there is no such code for them.
 */
export async function revokeLinkCode(args: { code: string; partnerId?: string; now?: number }): Promise<LinkCode | null> {
  const c = await getLinkCode(args.code);
  if (!c || (args.partnerId !== undefined && c.partnerId !== args.partnerId)) return null;
  if (c.revokedAt != null) return c;
  const next: LinkCode = { ...c, revokedAt: args.now ?? Date.now() };
  await kv1(["SET", k("link", c.code), JSON.stringify(next)]);
  return next;
}

export type ResolvedCode = { code: LinkCode; partner: Partner };

/**
 * The partner a code counts for, or null: an unknown, malformed, revoked or
 * expired code, or one whose account is gone, counts for nobody.
 */
export async function resolveLinkCode(raw: unknown, now = Date.now()): Promise<ResolvedCode | null> {
  if (!isLinkCodeShape(raw)) return null;
  const code = await getLinkCode(raw);
  if (!code || linkCodeState(code, now) !== "live") return null;
  const partner = await getPartner(code.partnerId);
  return partner ? { code, partner } : null;
}
