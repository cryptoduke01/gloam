import type { MetadataRoute } from "next";

/** Install metadata: name, icons and colours, so a saved shortcut opens the app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gloam",
    short_name: "Gloam",
    description: "Private stablecoin payments for people, teams and agents.",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/favicon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
