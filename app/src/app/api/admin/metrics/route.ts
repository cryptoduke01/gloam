import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchOnchainMetrics } from "@/lib/onchainMetrics";
import { readTractionSummary } from "@/lib/tractionStore";
import {
  isTestnetOpen,
  testnetOpensAtMs,
  testnetForceOpen,
} from "@/lib/testnetLaunch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin metrics: on-chain figures for both networks (cached about a minute,
 * see lib/onchainMetrics) plus the product event summary. `?fresh=1` skips the
 * snapshot cache (still at most one chain read per 15s).
 */
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get("fresh") === "1";
  const [onchain, product] = await Promise.all([
    fetchOnchainMetrics({ force }).catch((e) => ({
      error: e instanceof Error ? e.message : "onchain_failed",
    })),
    readTractionSummary().catch(() => ({
      backend: "memory" as const,
      totalEvents: 0,
      counters: {},
      dims: {},
      daily: [],
      recent: [],
    })),
  ]);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    launch: {
      open: isTestnetOpen(),
      forceOpen: testnetForceOpen(),
      opensAt: new Date(testnetOpensAtMs()).toISOString(),
      opensAtMs: testnetOpensAtMs(),
    },
    onchain,
    product,
  });
}
