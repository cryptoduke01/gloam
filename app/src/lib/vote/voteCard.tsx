import "server-only";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { C, Mark, loadAssets, size } from "@/lib/docsCard";
import type { VoteConfig } from "./config";
import { OPTION_ART, OptionIcon, type OptionMark } from "./optionArt";
import { visibleVotes } from "./registry";
import { voteTimeLine, votesTimeLine } from "./timeLine";

/**
 * Link preview cards for the holder votes: the site's ink card (mark,
 * wordmark, Aeonik Light, the etching along the foot) with the votes or one
 * vote's question and answers. Everything is read from lib/vote/config, so a
 * card always says what the page says, and the close line turns into "Results
 * are in" once the votes have closed.
 */

const PAD_X = 72;

/** Two lines as close in length as the words allow. */
function balance(text: string): string[] {
  const words = text.split(" ");
  let best = [text];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      best = [a, b];
      bestDiff = diff;
    }
  }
  return best;
}

const publicDir = join(process.cwd(), "public");
const exists = (p: string) => access(p).then(() => true, () => false);

/** A mark's logo as a data URL, or null when there is no file for it. */
async function markSrc(m: OptionMark): Promise<string | null> {
  const candidates = m.src ? [m.src] : [`/brand/logos/${m.id}.png`, `/brand/tokens/${m.id}.png`];
  for (const rel of candidates) {
    const file = join(publicDir, rel);
    if (await exists(file)) return `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
  }
  return null;
}

function Frame({ kicker, etchingTop, etching, children }: { kicker: string; etchingTop: number; etching: string; children: ReactNode }) {
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
      <img src={etching} alt="" width={1200} height={300} style={{ position: "absolute", left: 0, top: etchingTop, width: 1200, height: 300 }} />
      <div style={{ display: "flex", flexDirection: "column", padding: `60px ${PAD_X}px 0` }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Mark />
          <div style={{ marginLeft: 14, color: C.paper, fontSize: 30, fontWeight: 500, letterSpacing: "-0.015em", display: "flex" }}>Gloam</div>
          <div style={{ marginLeft: 18, width: 1, height: 26, background: C.line, display: "flex" }} />
          <div style={{ marginLeft: 18, color: C.mute, fontSize: 26, fontWeight: 300, letterSpacing: "-0.01em", display: "flex" }}>{kicker}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function TimeLine({ text, fontSize = 28 }: { text: string; fontSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", color: C.mute, fontSize, fontWeight: 300, letterSpacing: "-0.01em" }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, background: C.tint, marginRight: 14, display: "flex" }} />
      {text}
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

/** /vote: every open question under one headline, and when they close. */
export async function votesCard(now: number = Date.now()) {
  const { etching } = await loadAssets();
  const votes = visibleVotes(undefined, now).slice(0, 4);
  const line = votes.length ? votesTimeLine(votes, now) : "Votes open soon";
  return render(
    <Frame kicker="$GLOAM holder votes" etchingTop={440} etching={etching}>
      <div style={{ display: "flex", marginTop: 52, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 70,
              lineHeight: 1.04,
              fontWeight: 300,
              letterSpacing: "-0.028em",
              color: C.paper,
            }}
          >
            <span style={{ display: "flex" }}>Help decide what</span>
            <span style={{ display: "flex" }}>Gloam builds next</span>
          </div>
          <div style={{ display: "flex", marginTop: 34 }}>
            <TimeLine text={line} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 470, marginTop: 6 }}>
          {votes.map((v, i) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                padding: "16px 0",
                borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
              }}
            >
              <div style={{ display: "flex", width: 44, color: C.faint, fontSize: 22, fontWeight: 300, paddingTop: 3 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ display: "flex", flex: 1, color: C.paper, fontSize: 26, lineHeight: 1.22, fontWeight: 300, letterSpacing: "-0.012em" }}>
                {v.question}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>,
  );
}

function Marks({ marks, badges }: { marks: { src: string | null; symbol: string }[]; badges: { src: string | null }[] }) {
  const s = 36;
  return (
    <div style={{ display: "flex", position: "relative", alignItems: "center", marginRight: 16 }}>
      {marks.map((m, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: s + 4,
            height: s + 4,
            borderRadius: (s + 4) / 2,
            background: C.raised,
            border: `2px solid ${C.surface}`,
            marginLeft: i === 0 ? 0 : -12,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            color: C.paper,
            fontSize: 14,
          }}
        >
          {m.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.src} alt="" width={s} height={s} style={{ width: s, height: s, borderRadius: s / 2 }} />
          ) : (
            m.symbol.slice(0, 1)
          )}
        </div>
      ))}
      {badges.length > 0 && (
        <div style={{ display: "flex", position: "absolute", right: -8, bottom: -4 }}>
          {badges.map((b, i) =>
            b.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={b.src}
                alt=""
                width={20}
                height={20}
                style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${C.surface}`, marginLeft: i === 0 ? 0 : -6 }}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

/** /vote/<id>: the question, its answers with their logos, and when it closes. */
export async function voteCard(vote: VoteConfig | null, now: number = Date.now()) {
  if (!vote) return votesCard(now);
  const { etching } = await loadAssets();
  const art = OPTION_ART[vote.id] ?? [];
  const options = await Promise.all(
    vote.options.map(async (label, i) => {
      const a = art[i];
      return {
        label,
        icon: a?.icon,
        marks: a?.marks ? await Promise.all(a.marks.map(async (m) => ({ src: await markSrc(m), symbol: m.symbol }))) : [],
        badges: a?.badges ? await Promise.all(a.badges.map(async (m) => ({ src: await markSrc(m) }))) : [],
      };
    }),
  );
  const grid = options.length > 3;
  const lines = balance(vote.question);
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(60, Math.floor((size.width - PAD_X * 2) / (longest * 0.5)));

  return render(
    <Frame kicker="$GLOAM holder vote" etchingTop={grid ? 452 : 476} etching={etching}>
      <div style={{ display: "flex", marginTop: 40 }}>
        <TimeLine text={voteTimeLine(vote, now)} fontSize={26} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          fontSize,
          lineHeight: 1.06,
          fontWeight: 300,
          letterSpacing: "-0.026em",
          color: C.paper,
        }}
      >
        {lines.map((l) => (
          <span key={l} style={{ display: "flex" }}>
            {l}
          </span>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: grid ? "row" : "column",
          flexWrap: grid ? "wrap" : "nowrap",
          alignItems: "flex-start",
          marginTop: grid ? 30 : 26,
          width: size.width - PAD_X * 2,
          gap: grid ? 12 : 10,
        }}
      >
        {options.map((o) => (
          <div
            key={o.label}
            style={{
              display: "flex",
              alignItems: "center",
              height: grid ? 60 : 56,
              padding: "0 24px 0 10px",
              borderRadius: 30,
              background: C.surface,
              border: `1px solid ${C.line}`,
              ...(grid ? { width: (size.width - PAD_X * 2 - 12) / 2 } : {}),
            }}
          >
            {o.icon ? (
              <div
                style={{
                  display: "flex",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: C.raised,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 16,
                }}
              >
                <OptionIcon name={o.icon} size={22} color={C.paper} />
              </div>
            ) : o.marks.length ? (
              <Marks marks={o.marks} badges={o.badges} />
            ) : (
              <div style={{ display: "flex", width: 14 }} />
            )}
            <div style={{ display: "flex", color: C.paper, fontSize: 25, fontWeight: 300, letterSpacing: "-0.01em" }}>{o.label}</div>
          </div>
        ))}
      </div>
    </Frame>,
  );
}
