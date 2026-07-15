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

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [onchain, product] = await Promise.all([
    fetchOnchainMetrics().catch((e) => ({
      error: e instanceof Error ? e.message : "onchain_failed",
    })),
    readTractionSummary().catch(() => ({
      backend: "memory" as const,
      totalEvents: 0,
      counters: {},
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
