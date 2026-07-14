import { ImageResponse } from "next/og";

export const alt = "Gloam. Private money on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** System fonts only so the Edge Function stays under the 1MB plan limit. */
export default function OpenGraphImage() {
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
          fontFamily: "Georgia, Times New Roman, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#c8ff00",
            fontSize: 20,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
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
              fontSize: 26,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            G
          </div>
          GLOAM
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.06,
              color: "#ffffff",
              maxWidth: 920,
            }}
          >
            Private money on Robinhood Chain
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#a3a3a3",
              maxWidth: 780,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
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
          <span style={{ color: "#666666" }}>Chain ID 4663</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
