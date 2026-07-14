import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Analytics } from "@/components/Analytics";
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
    default: "Gloam. Private money on Robinhood Chain",
    template: "%s · Gloam",
  },
  description:
    "Trade and move money privately onchain. Shielded balances, private transfers, and private trading on Robinhood Chain.",
  metadataBase: new URL("https://gloam.trade"),
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/logo.png", type: "image/png" },
    ],
    apple: "/brand/logo.png",
  },
  openGraph: {
    title: "Gloam. Private money on Robinhood Chain",
    description:
      "Trade and move money privately onchain on Robinhood Chain.",
    url: "https://gloam.trade",
    siteName: "Gloam",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@gloamtrade",
    title: "Gloam. Private money on Robinhood Chain",
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
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <head>
        {/* Overused Grotesk — cleaner than Switzer for UI body */}
        <link
          href="https://fonts.cdnfonts.com/css/overused-grotesk"
          rel="stylesheet"
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-ink text-white"
        style={{
          fontFamily: '"Overused Grotesk", system-ui, sans-serif',
        }}
      >
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
