import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  createAdminSession,
  verifyAdminCode,
  adminCodeConfigured,
} from "@/lib/adminAuth";

export async function POST(req: Request) {
  if (!adminCodeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_ACCESS_CODE not set" },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim() ?? "";
  if (!verifyAdminCode(code)) {
    return NextResponse.json({ ok: false, error: "Invalid code" }, { status: 401 });
  }
  const session = createAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session failed" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  // Secure cookies only on HTTPS; allow HTTP local preview without breaking login
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.ADMIN_COOKIE_INSECURE !== "true";
  res.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}
