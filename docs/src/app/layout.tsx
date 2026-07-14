import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gloam Docs",
  description: "Documentation for Gloam — private money on Robinhood Chain.",
  metadataBase: new URL("https://docs.gloam.trade"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-ink text-white antialiased">{children}</body>
    </html>
  );
}
