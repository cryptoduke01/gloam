import type { Metadata } from "next";
import { TransparencyView } from "@/components/transparency/TransparencyView";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "What anyone can see about Gloam, read live from Robinhood Chain and Tempo: the money held in the vault, how many private deposits, transfers and cash-outs there have been, and what stays private.",
  alternates: { canonical: "/transparency" },
};

export default function TransparencyPage() {
  return <TransparencyView />;
}
