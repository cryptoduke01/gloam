import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { DiscloseView } from "@/components/app/DiscloseView";

export const metadata: Metadata = {
  title: "Prove",
};

export default function DisclosePage() {
  return (
    <AppShell
      title="Prove what you hold"
      subtitle="Show one private balance to someone you choose. They see that balance, nobody else sees anything."
      actions={
        <Link href="/verify" className="btn btn-ghost btn-sm">
          Check a proof
        </Link>
      }
    >
      <DiscloseView />
    </AppShell>
  );
}
