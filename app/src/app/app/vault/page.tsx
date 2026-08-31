import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { VaultHub } from "@/components/app/VaultHub";

export const metadata: Metadata = {
  title: "Vault",
};

export default function VaultPage() {
  return (
    <AppShell
      title="Vault"
      subtitle="Shield, trade, send, and cash out, all in one place. Your size stays sealed."
    >
      <Suspense
        fallback={
          <div className="rounded-xl border border-line bg-panel p-8 text-sm text-mute">
            Loading…
          </div>
        }
      >
        <VaultHub />
      </Suspense>
    </AppShell>
  );
}
