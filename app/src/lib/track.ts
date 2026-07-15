/**
 * First-party product analytics (after cookie consent "all").
 * Events land on POST /api/collect — optional webhook + Vercel logs.
 */

import { analyticsAllowed } from "@/lib/consent";

export type TrackPayload = {
  t: string;
  path?: string;
  ref?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  ts?: number;
};

export function track(event: string, meta?: TrackPayload["meta"]) {
  if (typeof window === "undefined") return;
  if (!analyticsAllowed()) return;

  const body: TrackPayload = {
    t: event,
    path: window.location.pathname,
    ref: document.referrer || null,
    meta: meta ?? undefined,
    ts: Date.now(),
  };

  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/collect",
        new Blob([json], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
