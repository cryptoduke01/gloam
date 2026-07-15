/**
 * Product analytics → POST /api/collect → traction store + /admin.
 *
 * Product funnel events always fire (first-party ops metrics).
 * Marketing pageviews still respect cookie consent.
 */

import { analyticsAllowed } from "@/lib/consent";

export type TrackPayload = {
  t: string;
  path?: string;
  ref?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  ts?: number;
};

function send(body: TrackPayload) {
  if (typeof window === "undefined") return;
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

/** Product / funnel events — always recorded for traction (no ad cookies). */
export function track(
  event: string,
  meta?: TrackPayload["meta"],
  opts?: { requireConsent?: boolean },
) {
  if (typeof window === "undefined") return;
  if (opts?.requireConsent && !analyticsAllowed()) return;

  send({
    t: event,
    path: window.location.pathname,
    ref: document.referrer || null,
    meta: meta ?? undefined,
    ts: Date.now(),
  });
}

/** Marketing pageviews — only after "Accept all". */
export function trackPageview() {
  track("pageview", undefined, { requireConsent: true });
}
