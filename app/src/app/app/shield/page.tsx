import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { ShieldView } from "@/components/app/ShieldView";

export const metadata: Metadata = {
  title: "Shield",
};

export default function ShieldPage() {
  return (
    <AppShell
      title="Shield"
      subtitle="Deposit into the vault. Then Move to private-send or cash out."
    >
      <ShieldView />
    </AppShell>
  );
}
