import type { Metadata } from "next";
import { PartnerDashboard } from "./PartnerDashboard";

export const metadata: Metadata = {
  title: "Partner portal",
  description: "Your Gloam API keys, fee setting, payout addresses, volume and would-be commissions.",
  robots: { index: false, follow: false },
};

export default function PartnerDashboardPage() {
  return <PartnerDashboard />;
}
