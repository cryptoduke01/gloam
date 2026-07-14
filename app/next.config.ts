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
};

export default nextConfig;
