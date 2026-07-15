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
      subtitle="Private send: To (tag) + Amount, like a normal send, with the vault under the hood."
    >
      <MoveView />
    </AppShell>
  );
}
