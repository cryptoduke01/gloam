import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { XrayForm } from "@/components/xray/XrayForm";

export const metadata: Metadata = {
  title: "Wallet X-ray",
  description: "Your wallet is a public receipt. Paste any address and see everything anyone can read about it.",
  alternates: { canonical: "/xray" },
  openGraph: { title: "Your wallet is a public receipt.", url: "/xray", siteName: "Gloam", type: "website" },
  twitter: { card: "summary_large_image", title: "Your wallet is a public receipt.", site: "@gloamtrade" },
};

export default function XrayPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-[1400px] flex-col justify-center px-4 py-16 sm:px-7">
        <div className="mx-auto w-full max-w-[640px]">
          <h1 className="t-display-xl">Your wallet is a public receipt.</h1>
          <XrayForm className="mt-10" autoFocus />
        </div>
      </main>
      <Footer />
    </div>
  );
}
