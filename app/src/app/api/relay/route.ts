import { NextResponse } from "next/server";
import {
  RelayError,
  checkRateLimit,
  networkForChain,
  relayMemo,
  relayStatus,
  relayTransfer,
  relayUnshield,
} from "@/lib/relay/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which networks the relay can submit on right now (no secrets). */
export async function GET() {
  const networks = await relayStatus();
  return NextResponse.json({ ok: true, networks }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Submit an already-proven private action through the Gloam relay.
 * Body: { chainId, action: "transfer" | "unshield" | "memo", ...args }
 * Returns { ok: true, hash } as soon as the transaction is sent; the client
 * waits for the receipt itself.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new RelayError("Invalid request.");
    const net = networkForChain(body.chainId);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    checkRateLimit(ip, net.chainId);

    let hash: `0x${string}`;
    switch (body.action) {
      case "transfer":
        hash = await relayTransfer(net, body);
        break;
      case "unshield":
        hash = await relayUnshield(net, body);
        break;
      case "memo":
        hash = await relayMemo(net, body);
        break;
      default:
        throw new RelayError("Unknown action.");
    }
    return NextResponse.json({ ok: true, hash });
  } catch (e) {
    if (e instanceof RelayError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status });
    }
    console.error("gloam_relay", e);
    return NextResponse.json(
      { ok: false, error: "The relay hit an error. Send from your wallet for now.", code: "internal" },
      { status: 500 }
    );
  }
}
