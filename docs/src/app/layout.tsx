import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "Gloam Docs",
    template: "%s · Gloam Docs",
  },
  description:
    "Documentation and whitepaper for Gloam — trade and move money privately onchain on Robinhood Chain.",
  metadataBase: new URL("https://docs.gloam.trade"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrument.variable} h-full`}>
      <head>
        <link
          href="https://fonts.cdnfonts.com/css/overused-grotesk"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full bg-ink text-white antialiased"
        style={{ fontFamily: '"Overused Grotesk", system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
