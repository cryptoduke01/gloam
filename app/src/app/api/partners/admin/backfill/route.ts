import type { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { ApiError, jsonBody, portal } from "@/lib/partnersApi";
import { sameSiteJson } from "@/lib/partnersAuth";
import { addressBook } from "@/lib/partnerAddresses";
import { runBackfill } from "@/lib/partnerBackfill";
import { k, kv, kv1 } from "@/lib/partnersKv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A pass stops starting new spans after this; the next one picks up where it stopped. */
const BUDGET_MS = 40_000;

/**
 * Admin only, POST { dryRun, from: "deploy" | "cursor" }: one pass of the
 * on-chain match (lib/partnerBackfill) over every mainnet, for every partner's
 * receiving addresses. Read-only on chain. A dry run counts nothing and moves no
 * cursor. One pass at a time.
 */
export async function POST(req: NextRequest) {
  return portal(async () => {
    if (!sameSiteJson(req)) throw new ApiError(403, "bad_origin", "Run this from the Gloam site.");
    if (!(await isAdminAuthenticated())) throw new ApiError(401, "unauthorized", "Admin session required.");
    const body = await jsonBody(req, 256);
    if (typeof body.dryRun !== "boolean") throw new ApiError(400, "bad_request", "Send { dryRun: true | false, from }.");
    const from = body.from === "deploy" ? "deploy" : body.from === "cursor" ? "cursor" : null;
    if (!from) throw new ApiError(400, "bad_request", 'from must be "deploy" or "cursor".');
    const lockKey = k("backfill", "running");
    const [got] = await kv([["SET", lockKey, String(Date.now()), "NX", "EX", 90]]);
    if (got !== "OK") throw new ApiError(409, "busy", "A pass is already running. Wait for it to finish.");
    try {
      const book = await addressBook();
      const result = await runBackfill({ dryRun: body.dryRun, from, book, budgetMs: BUDGET_MS });
      return { data: result };
    } finally {
      await kv1(["DEL", lockKey]).catch(() => undefined);
    }
  });
}
