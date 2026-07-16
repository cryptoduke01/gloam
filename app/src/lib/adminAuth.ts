import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "gloam_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function secret(): string | null {
  const a = process.env.ADMIN_ACCESS_CODE?.trim();
  if (a) return a;
  // Dev fallback so local works; production must set ADMIN_ACCESS_CODE
  if (process.env.NODE_ENV !== "production") return "gloam-dev-admin";
  return null;
}

function sign(payload: string): string {
  const s = secret();
  if (!s) return "";
  return createHmac("sha256", s).update(payload).digest("base64url");
}

export function adminCodeConfigured(): boolean {
  return Boolean(secret());
}

export function verifyAdminCode(code: string): boolean {
  const s = secret();
  if (!s || !code) return false;
  try {
    // Constant-time compare without length leak via padding
    const a = Buffer.from(code.normalize("NFKC"));
    const b = Buffer.from(s.normalize("NFKC"));
    const len = Math.max(a.length, b.length, 1);
    const ap = Buffer.alloc(len);
    const bp = Buffer.alloc(len);
    a.copy(ap);
    b.copy(bp);
    const sameLen = a.length === b.length;
    const sameBytes = timingSafeEqual(ap, bp);
    return sameLen && sameBytes;
  } catch {
    return false;
  }
}

/** Create signed session value: exp.sig */
export function createAdminSession(): string | null {
  if (!secret()) return null;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = String(exp);
  const sig = sign(payload);
  if (!sig) return null;
  return `${payload}.${sig}`;
}

export function verifyAdminSession(token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSession(jar.get(COOKIE)?.value);
}

export { COOKIE as ADMIN_COOKIE, MAX_AGE_SEC as ADMIN_COOKIE_MAX_AGE };
