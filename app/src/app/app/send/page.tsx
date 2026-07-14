import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { SendView } from "@/components/app/SendView";

export const metadata: Metadata = {
  title: "Send",
};

export default function SendPage() {
  return (
    <AppShell
      title="Send"
      subtitle="Public wallet send on testnet. For private pay, use Move."
    >
      <SendView />
    </AppShell>
  );
}
