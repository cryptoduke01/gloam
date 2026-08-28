import type { NextConfig } from "next";
import path from "node:path";

/**
 * When this package is the Vercel Root Directory (`app`), keep tracing
 * inside the monorepo without pointing output at a broken `.next` path.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Compile the workspace SDK from source so there is no build-order dependency
  // (Vercel builds only `app`). @gloam/sdk exports TS source; Next transpiles it.
  transpilePackages: ["@gloam/sdk"],
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
    // @gloam/sdk ships NodeNext TS source (".js" import specifiers). Let webpack
    // resolve those to the ".ts" sources when transpiling the workspace package.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
