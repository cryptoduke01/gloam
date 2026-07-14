import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { MoveView } from "@/components/app/MoveView";

export const metadata: Metadata = {
  title: "Move",
};

export default function MovePage() {
  return (
    <AppShell
      title="Move"
      subtitle="Payment tickets inside the vault (no 0x address) — or cash out publicly."
    >
      <MoveView />
    </AppShell>
  );
}
