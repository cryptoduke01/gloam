import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/Analytics";
import { CookieBanner } from "@/components/CookieBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const siteTitle = "Trade Everything on Robinhood Privately · Gloam";
const siteDescription =
  "Trade Everything on Robinhood Privately. Stocks, memes, shielded balances, private transfers, and private trading on Robinhood Chain.";

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
    "Robinhood Chain",
    "private money",
    "shielded balances",
    "private trading",
    "tokenized stocks",
    "memecoins",
    "private meme trading",
    "GLOAM",
    "$GLOAM",
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
        {/* Main typeface: General Sans (Fontshare) — free Aeonik-family grotesque.
            Drop-in for a licensed Aeonik Pro later via self-hosted @font-face. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@300,400,500,600,700&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;d.dataset.theme='light';d.classList.add('light');d.classList.remove('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-background text-foreground"
        style={{ fontFamily: '"General Sans", system-ui, sans-serif' }}
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
