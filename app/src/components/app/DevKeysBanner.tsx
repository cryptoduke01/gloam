"use client";

import Link from "next/link";
import { isDevCeremony } from "@/lib/circuitArtifacts";

/**
 * Honest testnet banner: proving keys are development ceremony only.
 */
export function DevKeysBanner({ compact = false }: { compact?: boolean }) {
  if (!isDevCeremony()) return null;

  if (compact) {
    return (
      <p className="text-xs text-mute">
        Dev proving keys · testnet only ·{" "}
        <Link href="/docs/production" className="text-lime hover:underline">
          production gate
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-mute">
      <p className="font-medium text-foreground">Development proving keys</p>
      <p className="mt-1">
        Proofs work on this testnet, but the trusted setup is{" "}
        <strong className="text-foreground">not</strong> a production ceremony.
        Do not use with real money.{" "}
        <Link href="/docs/production" className="text-lime hover:underline">
          What has to ship before mainnet →
        </Link>
      </p>
    </div>
  );
}
