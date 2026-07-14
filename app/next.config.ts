import type { NextConfig } from "next";
import path from "node:path";

/**
 * When this package is the Vercel Root Directory (`app`), keep tracing
 * inside the monorepo without pointing output at a broken `.next` path.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  images: {
    formats: ["image/avif", "image/webp"],
  },
  webpack: (config) => {
    // WalletConnect optional deps — silence missing optional modules
    config.externals.push("pino-pretty", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
