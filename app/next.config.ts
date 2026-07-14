import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Workspace root is monorepo parent; pin Turbopack to this package.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
