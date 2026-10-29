import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { KvUnavailableError } from "@/lib/partnersKv";
import { eligibleTotal } from "@/lib/vote/core";
import { ensNameOf } from "@/lib/vote/ens";
import { excludedForVote, snapshotFor, visibleVotes } from "@/lib/vote/registry";
import { voterStanding, type VoterStanding } from "@/lib/vote/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READS_PER_MINUTE = 60;

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * One wallet across every vote the site shows: its ENS name (when it has
 * one), and per vote its weight, why it is excluded, its vote so far, and the
 * eligible total its share is worked out against.
 */
export async function GET(req: Request) {
  const rate = await hitRateLimit(clientIp(req), "vote-me", READS_PER_MINUTE);
  if (!rate.allowed) return fail(429, "rate_limited", "Too many requests. Wait a minute.", { "Retry-After": String(rate.retryAfterSec) });
  const raw = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddress(raw, { strict: false })) return fail(400, "bad_address", "That wallet address doesn't look right.");
  const address = getAddress(raw);
  try {
    const [name, votes] = await Promise.all([
      ensNameOf(address),
      Promise.all(
        visibleVotes().map(async (v) => {
          const snapshot = snapshotFor(v);
          if (!snapshot) return [v.id, null] as const;
          const excluded = excludedForVote(v);
          const standing: VoterStanding = await voterStanding(v, snapshot, excluded, address);
          const eligible = eligibleTotal(snapshot, excluded);
          return [v.id, { ...standing, eligibleWeight: eligible.weight.toString(), eligibleWallets: eligible.wallets }] as const;
        }),
      ),
    ]);
    return NextResponse.json({ ok: true, data: { address, name, votes: Object.fromEntries(votes) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof KvUnavailableError) return fail(503, "storage", "Your votes can't be read for a moment. Try again shortly.");
    return fail(500, "error", "Something went wrong reading your votes.");
  }
}
