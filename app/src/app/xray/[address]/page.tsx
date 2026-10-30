import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { XrayForm } from "@/components/xray/XrayForm";
import { XrayReceipt } from "@/components/xray/XrayReceipt";
import { parseXrayQuery, shortAddress } from "@/lib/xray/input";

type Params = { params: Promise<{ address: string }> };

// the wallet is in the path: rendered per request and never written to a cache
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const query = parseXrayQuery((await params).address);
  const who = query.kind === "address" ? shortAddress(query.address) : query.kind === "ens" ? query.name : null;
  const title = who ? `${who} is a public receipt` : "Wallet X-ray";
  const description = "Everything anyone can see about this wallet, read from public chain data.";
  return {
    title,
    description,
    // the next.config header says the same for the page and its preview image
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, siteName: "Gloam", type: "website" },
    twitter: { card: "summary_large_image", title, description, site: "@gloamtrade" },
  };
}

export default async function XrayWalletPage({ params }: Params) {
  const query = parseXrayQuery((await params).address);
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-10 sm:px-7 sm:pt-16">
        {query.kind === "invalid" ? (
          <div className="mx-auto max-w-[640px] py-16">
            <h1 className="t-display-l">That is not a wallet address.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mute">Paste a 0x address or an .eth name.</p>
            <XrayForm className="mt-8" />
          </div>
        ) : (
          <XrayReceipt query={query} />
        )}
      </main>
      <Footer />
    </div>
  );
}
