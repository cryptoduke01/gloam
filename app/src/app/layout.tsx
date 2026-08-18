import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { CookieBanner } from "@/components/CookieBanner";
import { ThemeDock } from "@/components/ThemeDock";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

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
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/logo.png", type: "image/png" },
    ],
    apple: "/brand/logo.png",
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
    <html lang="en" className={`${instrument.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta
          name="ory-verify"
          content="orynth-d061bf2ee92a4996b6e3121097472653"
        />
        <link
          href="https://fonts.cdnfonts.com/css/overused-grotesk"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('gloam_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}var d=document.documentElement;d.dataset.theme=t;d.classList.add(t);d.classList.remove(t==='dark'?'light':'dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="flex min-h-full flex-col bg-background text-foreground"
        style={{ fontFamily: '"Overused Grotesk", system-ui, sans-serif' }}
      >
        <ThemeProvider>
          {children}
          <ThemeDock />
          <CookieBanner />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
