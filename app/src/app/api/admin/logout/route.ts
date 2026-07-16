import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.ADMIN_COOKIE_INSECURE !== "true";
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
