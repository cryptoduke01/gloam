import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { CookieBanner } from "@/components/CookieBanner";
import "./globals.css";

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Gloam — Private money on Robinhood Chain",
    template: "%s · Gloam",
  },
  description:
    "Trade and move money privately onchain. Shielded balances, private transfers, and private trading on Robinhood Chain.",
  metadataBase: new URL("https://gloam.trade"),
  openGraph: {
    title: "Gloam — Private money on Robinhood Chain",
    description:
      "Trade and move money privately onchain. Built for Robinhood Chain.",
    url: "https://gloam.trade",
    siteName: "Gloam",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@gloamtrade",
    title: "Gloam",
    description: "Private money on Robinhood Chain.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} h-full antialiased`}
    >
      <head>
        {/* Switzer via Fontshare — pairs with Instrument Serif */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-ink text-white"
        style={{ fontFamily: "Switzer, system-ui, sans-serif" }}
      >
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
