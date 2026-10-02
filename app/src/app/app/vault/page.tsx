import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { VaultHub } from "@/components/app/VaultHub";

export const metadata: Metadata = {
  title: "Vault",
};

function VaultSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the vault">
      <div className="h-12 w-full max-w-[380px] rounded-full bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="gl-card h-[420px] motion-safe:animate-pulse" />
        <div className="gl-card h-[220px] motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <AppShell
      title="Vault"
      subtitle="Add money privately, send it, and cash out, all in one place. Your amounts stay hidden."
    >
      <Suspense fallback={<VaultSkeleton />}>
        <VaultHub />
      </Suspense>
    </AppShell>
  );
}
