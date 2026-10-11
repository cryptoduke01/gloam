import type { Metadata } from "next";

// The verifier page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Verify",
  description:
    "Check a Gloam proof someone shared with you, and the contracts that hold the money. The proof is checked in your browser and nothing is sent to Gloam. No wallet, no account.",
  alternates: { canonical: "/verify" },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
