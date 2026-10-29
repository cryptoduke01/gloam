import { ImageResponse } from "next/og";
import { C, Mark, loadAssets, size } from "@/lib/docsCard";

/**
 * The link preview for a payment request (lib/paymentRequest): the claim
 * card's ink field and etching, saying a private payment has been asked for.
 * Who asked and how much ride in the link's fragment, which never reaches a
 * server or a crawler, so the card names neither. The vault page points its
 * Open Graph and Twitter images here when the link is a request (mode=pay).
 */
// the card never changes, so it is built once and cached
export const dynamic = "force-static";

export async function GET() {
  const { light, medium, etching } = await loadAssets();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.ink,
          fontFamily: "Aeonik",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 72px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Mark />
            <div style={{ color: C.paper, fontSize: 30, fontWeight: 500, letterSpacing: "-0.015em", display: "flex" }}>Gloam</div>
          </div>
          <div
            style={{
              marginTop: 44,
              fontSize: 76,
              lineHeight: 1.02,
              fontWeight: 300,
              letterSpacing: "-0.028em",
              color: C.paper,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ display: "flex" }}>You have been asked for</span>
            <span style={{ display: "flex" }}>a private payment</span>
          </div>
          <div style={{ marginTop: 22, fontSize: 30, fontWeight: 300, letterSpacing: "-0.01em", color: C.mute, display: "flex" }}>
            Open the link to pay privately with Gloam.
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={etching} alt="" width={1200} height={300} style={{ position: "absolute", left: 0, top: 380, width: 1200, height: 300 }} />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Aeonik", data: light, weight: 300, style: "normal" },
        { name: "Aeonik", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
