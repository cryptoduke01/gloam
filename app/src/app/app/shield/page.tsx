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
      subtitle="Put ETH in the pool. See it on Portfolio. Private take-out comes next."
    >
      <ShieldView />
    </AppShell>
  );
}
