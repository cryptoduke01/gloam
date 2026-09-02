/** @type {import('next').NextConfig} */
const nextConfig = {
  // @gloam/sdk ships TypeScript source; Next transpiles it.
  transpilePackages: ["@gloam/sdk"],
  webpack: (config) => {
    // WalletConnect / node-only optional deps pulled in transitively.
    config.externals.push("pino-pretty", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    // The SDK uses NodeNext ".js" import specifiers; resolve them to ".ts".
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
