import { ImageResponse } from "next/og";

export const alt = "Trade Everything on Robinhood Privately · Gloam";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Lightweight OG card (system fonts only; under Edge 1MB). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#000000",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 8,
            height: "100%",
            background: "#c8ff00",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "#c8ff00",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#000000",
                fontSize: 28,
                fontWeight: 700,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
              }}
            >
              G
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 28,
                  fontWeight: 600,
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                Gloam
              </div>
              <div
                style={{
                  color: "#c8ff00",
                  fontSize: 14,
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase" as const,
                }}
              >
                Private money
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 64,
                lineHeight: 1.05,
                color: "#ffffff",
                maxWidth: 900,
                fontFamily: "Georgia, Times New Roman, serif",
                letterSpacing: "-0.03em",
                display: "flex",
              }}
            >
              Trade Everything on Robinhood Privately
            </div>
            <div
              style={{
                fontSize: 24,
                color: "#a3a3a3",
                maxWidth: 720,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                lineHeight: 1.4,
                display: "flex",
              }}
            >
              Stocks · Memes · Shielded balances
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #1a1a1a",
              paddingTop: 22,
              fontFamily: "ui-monospace, monospace",
              fontSize: 16,
            }}
          >
            <div style={{ color: "#c8ff00", display: "flex" }}>gloam.trade</div>
            <div style={{ color: "#666666", display: "flex" }}>CHAIN 4663</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
