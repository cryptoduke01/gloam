import { ImageResponse } from "next/og";

export const alt = "Gloam — trade everything, reveal nothing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Twilight OG card — light paper, ink type, crescent mark. System fonts only. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(125deg, #F4F3EF 34%, #ECDCCB 72%, #D9C6D8 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "68px 76px",
            width: "100%",
            height: "100%",
          }}
        >
          {/* brand lockup — crescent mark + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                position: "relative",
                width: 60,
                height: 60,
                borderRadius: 17,
                background: "#121316",
                display: "flex",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  top: 20,
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "#F4F3EF",
                  display: "flex",
                }}
              />
            </div>
            <div
              style={{
                color: "#121316",
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                display: "flex",
              }}
            >
              Gloam
            </div>
          </div>

          {/* headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                fontSize: 88,
                lineHeight: 0.98,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span style={{ color: "#121316", display: "flex" }}>
                Trade everything.
              </span>
              <span style={{ color: "#6E6E76", display: "flex" }}>
                Reveal nothing.
              </span>
            </div>
            <div
              style={{
                fontSize: 26,
                color: "#565660",
                maxWidth: 760,
                lineHeight: 1.4,
                display: "flex",
              }}
            >
              Shield a balance, trade tokenized stocks and crypto, and settle
              on-chain. A proof is verified, never your size.
            </div>
          </div>

          {/* footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #E5E3DD",
              paddingTop: 24,
              fontSize: 20,
            }}
          >
            <div style={{ color: "#121316", fontWeight: 600, display: "flex" }}>
              gloam.trade
            </div>
            <div style={{ color: "#6E6E76", display: "flex" }}>
              Private by construction
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
