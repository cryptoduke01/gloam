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
      subtitle="Direct pay to a Gloam receive tag, bearer tickets, or cash out."
    >
      <MoveView />
    </AppShell>
  );
}
