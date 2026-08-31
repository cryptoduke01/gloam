import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/Analytics";
import { CookieBanner } from "@/components/CookieBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const siteTitle = "Gloam · The onchain dark pool";
const siteDescription =
  "Private markets for stocks and crypto. Shield a balance, then trade with your size sealed. Settlement is public, your strategy is not.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gloam.trade"),
  title: {
    default: siteTitle,
    template: "%s · Gloam",
  },
  description: siteDescription,
  applicationName: "Gloam",
  authors: [{ name: "Gloam", url: "https://gloam.trade" }],
  creator: "Gloam",
  keywords: [
    "Gloam",
    "onchain dark pool",
    "private trading",
    "tokenized stocks",
    "shielded balances",
    "private markets",
    "private swaps",
    "crypto privacy",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://gloam.trade",
    siteName: "Gloam",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@gloamtrade",
    creator: "@gloamtrade",
    title: siteTitle,
    description: siteDescription,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://gloam.trade" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light h-full antialiased" suppressHydrationWarning>
      <head>
        <meta
          name="ory-verify"
          content="orynth-d061bf2ee92a4996b6e3121097472653"
        />
        {/* Main typeface: Aeonik, self-hosted woff2 (see globals.css @font-face). */}
        <link
          rel="preload"
          href="/fonts/Aeonik-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <link
          rel="preload"
          href="/fonts/Aeonik-Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;d.dataset.theme='light';d.classList.add('light');d.classList.remove('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-background text-foreground"
        style={{ fontFamily: '"Aeonik", system-ui, sans-serif' }}
      >
        <ThemeProvider>
          {children}
          <CookieBanner />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
