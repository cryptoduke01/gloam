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
      subtitle="Private send keeps amount off the public book. Cash out publishes size — stay in vault when you can."
    >
      <MoveView />
    </AppShell>
  );
}
