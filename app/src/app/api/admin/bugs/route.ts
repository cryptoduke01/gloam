import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { kvBackend } from "@/lib/partnersKv";
import { listBugReports } from "@/lib/telegramBot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: bug reports the Telegram helper saved, newest first. */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: { message: "Admin session required." } }, { status: 401 });
  }
  const backend = kvBackend();
  try {
    const reports = backend === "none" ? [] : await listBugReports();
    return NextResponse.json({ ok: true, data: { backend, reports } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: { message: "Could not read bug reports." } }, { status: 503 });
  }
}
