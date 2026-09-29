import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { PayrollView } from "@/components/app/PayrollView";
import { ClientOnly } from "@/components/app/ClientOnly";

export const metadata: Metadata = {
  title: "Payroll",
};

export default function PayrollPage() {
  return (
    <AppShell
      title="Payroll"
      subtitle="Pay your whole team privately. Upload a list, pay everyone at once, nobody sees who got what."
    >
      {/* Balances, runs and the network all live in this browser. */}
      <ClientOnly>
        <PayrollView />
      </ClientOnly>
    </AppShell>
  );
}
