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
      subtitle="Pay someone inside the vault, or cash out to your open wallet."
    >
      <MoveView />
    </AppShell>
  );
}
