import "server-only";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { C, Mark, loadAssets, size } from "@/lib/docsCard";

/**
 * Link preview cards for the Wallet X-ray: the site's ink card, built to be
 * read at feed size. One big number or one big line, whose wallet it is, and
 * the Gloam mark. Nothing here is estimated: with no figure to show, the card
 * carries the headline instead.
 */

const PAD_X = 72;

/** The headline number: whole dollars, or millions and up in short form, so it always fits on one line. */
export function cardUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e11 ? 0 : 1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1) return `$${Math.floor(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

/** Sized so the longest number the card can show ("$999,999") stays inside the margins. */
function numberSize(text: string): number {
  return Math.min(190, Math.floor(1560 / text.length));
}

function Frame({ etching, children }: { etching: string; children: ReactNode }) {
  return (
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={etching} alt="" width={1200} height={300} style={{ position: "absolute", left: 0, top: 452, width: 1200, height: 300 }} />
      <div style={{ display: "flex", flexDirection: "column", padding: `60px ${PAD_X}px 0` }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Mark />
          <div style={{ marginLeft: 14, color: C.paper, fontSize: 30, fontWeight: 500, letterSpacing: "-0.015em", display: "flex" }}>Gloam</div>
          <div style={{ marginLeft: 18, width: 1, height: 26, background: C.line, display: "flex" }} />
          <div style={{ marginLeft: 18, color: C.mute, fontSize: 26, fontWeight: 300, letterSpacing: "-0.01em", display: "flex" }}>Wallet X-ray</div>
        </div>
        {children}
      </div>
    </div>
  );
}

async function render(node: ReactNode) {
  const { light, medium } = await loadAssets();
  return new ImageResponse(node as React.ReactElement, {
    ...size,
    fonts: [
      { name: "Aeonik", data: light, weight: 300, style: "normal" },
      { name: "Aeonik", data: medium, weight: 500, style: "normal" },
    ],
  });
}

function Headline({ lines }: { lines: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 88,
        lineHeight: 1.04,
        fontWeight: 300,
        letterSpacing: "-0.03em",
        color: C.paper,
      }}
    >
      {lines.map((l) => (
        <span key={l} style={{ display: "flex" }}>
          {l}
        </span>
      ))}
    </div>
  );
}

/** One wallet: its public value, or the headline when no figure could be read. */
export async function walletCard({ usd, who }: { usd: number | null; who: string }) {
  const { etching } = await loadAssets();
  const text = usd != null && usd > 0 ? cardUsd(usd) : null;
  return render(
    <Frame etching={etching}>
      {text ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div
            style={{
              display: "flex",
              fontSize: numberSize(text),
              lineHeight: 1,
              fontWeight: 300,
              letterSpacing: "-0.025em",
              color: C.paper,
            }}
          >
            {text}
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 38, fontWeight: 300, letterSpacing: "-0.015em", color: C.mute }}>
            <span style={{ display: "flex" }}>public in&nbsp;</span>
            <span style={{ display: "flex", color: C.paper }}>{who}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
          <Headline lines={["This wallet is", "a public receipt."]} />
          <div style={{ display: "flex", marginTop: 26, fontSize: 38, fontWeight: 300, letterSpacing: "-0.015em", color: C.paper }}>{who}</div>
        </div>
      )}
    </Frame>
  );
}

/** /xray itself, and a link with no wallet in it. */
export async function headlineCard() {
  const { etching } = await loadAssets();
  return render(
    <Frame etching={etching}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
        <Headline lines={["Your wallet is", "a public receipt."]} />
      </div>
    </Frame>
  );
}

export { size };
