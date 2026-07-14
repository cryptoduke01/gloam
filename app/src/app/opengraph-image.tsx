import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Gloam. Private money on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  // Instrument Serif from Google Fonts for OG (matches site display face)
  const serif = await fetch(
    "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"
  ).then((r) => r.arrayBuffer()).catch(() => null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: "56px 64px",
          fontFamily: serif ? "Instrument Serif" : "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#c8ff00",
            fontSize: 22,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: "#c8ff00",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: 700,
              fontSize: 28,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            G
          </div>
          GLOAM
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              lineHeight: 1.05,
              color: "#ffffff",
              maxWidth: 900,
            }}
          >
            Private money on Robinhood Chain
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a3a3a3",
              maxWidth: 780,
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.35,
            }}
          >
            Shield. Move. Trade. Without printing your book to the public chain.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            color: "#c8ff00",
          }}
        >
          <span>gloam.trade</span>
          <span style={{ color: "#666" }}>Chain ID 4663</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: serif
        ? [
            {
              name: "Instrument Serif",
              data: serif,
              style: "normal" as const,
              weight: 400 as const,
            },
          ]
        : [],
    }
  );
}
