import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { DiscloseView } from "@/components/app/DiscloseView";

export const metadata: Metadata = {
  title: "Prove",
};

function ProveSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-12 w-full max-w-[360px] rounded-full bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="gl-card h-[420px] motion-safe:animate-pulse" />
        <div className="gl-card h-[260px] motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export default function DisclosePage() {
  return (
    <AppShell
      title="Prove what you hold"
      subtitle="Show a balance, a minimum you hold, or a payment you got, to someone you choose. They see only that, nobody else sees anything."
      actions={
        <Link href="/verify" className="btn btn-ghost btn-sm">
          Check a proof
        </Link>
      }
    >
      <Suspense fallback={<ProveSkeleton />}>
        <DiscloseView />
      </Suspense>
    </AppShell>
  );
}
