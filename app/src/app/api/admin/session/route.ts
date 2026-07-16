import { NextResponse } from "next/server";
import {
  adminCodeConfigured,
  isAdminAuthenticated,
} from "@/lib/adminAuth";

/** Lightweight session check — does not load on-chain metrics. */
export async function GET() {
  if (!adminCodeConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "ADMIN_ACCESS_CODE not set" },
      { status: 503 },
    );
  }
  const authed = await isAdminAuthenticated();
  if (!authed) {
    return NextResponse.json(
      { ok: false, configured: true, authed: false },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, configured: true, authed: true });
}
