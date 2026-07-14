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
      subtitle="Public ETH on Robinhood Chain testnet. Real settlement. Open book."
    >
      <SendView />
    </AppShell>
  );
}
