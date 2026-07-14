import { NextResponse } from "next/server";

/**
 * First-party analytics intake. Only called after optional cookie consent.
 * Currently acknowledges events; wire to a store/provider when ready.
 */
export async function POST(req: Request) {
  try {
    const data = await req.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // Intentionally minimal — no PII logging in v1
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
