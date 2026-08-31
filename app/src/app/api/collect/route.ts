import { NextResponse } from "next/server";
import { recordTractionEvent } from "@/lib/tractionStore";

type Body = {
  t?: unknown;
  path?: unknown;
  ref?: unknown;
  meta?: unknown;
  ts?: unknown;
};

/**
 * First-party analytics intake.
 * Persists to traction store (memory + optional Upstash Redis).
 * Optional TRACTION_WEBHOOK_URL for Discord/Slack.
 */
export async function POST(req: Request) {
  try {
    const data = (await req.json().catch(() => null)) as Body | null;
    if (!data || typeof data !== "object" || typeof data.t !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const event = {
      t: data.t.slice(0, 64),
      path: typeof data.path === "string" ? data.path.slice(0, 200) : null,
      ref: typeof data.ref === "string" ? data.ref.slice(0, 300) : null,
      meta:
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : null,
      ts: typeof data.ts === "number" ? data.ts : Date.now(),
      ua: req.headers.get("user-agent")?.slice(0, 160) ?? null,
    };

    console.info("gloam_traction", JSON.stringify(event));
    await recordTractionEvent(event);

    const webhook = process.env.TRACTION_WEBHOOK_URL?.trim();
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `**${event.t}** \`${event.path ?? ""}\``,
            embeds: [
              {
                title: event.t,
                description: event.path ?? "",
                fields: [
                  {
                    name: "ref",
                    value: (event.ref ?? ", ").slice(0, 200),
                    inline: false,
                  },
                  {
                    name: "meta",
                    value: event.meta
                      ? JSON.stringify(event.meta).slice(0, 500)
                      : ", ",
                    inline: false,
                  },
                ],
                timestamp: new Date(event.ts).toISOString(),
              },
            ],
          }),
        });
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
