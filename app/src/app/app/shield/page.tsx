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
      subtitle="Enter the privacy vault. Then private send, private trade, or cash out (public amount)."
    >
      <ShieldView />
    </AppShell>
  );
}
