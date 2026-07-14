"use client";

import { useEffect, useState } from "react";
import {
  analyticsAllowed,
  CONSENT_KEY,
  type ConsentValue,
} from "@/lib/consent";

/**
 * Lightweight first-party analytics. Loads only after "Accept all".
 * Essential-only: nothing network-bound beyond the page itself.
 */
export function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(analyticsAllowed());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY) sync();
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ConsentValue>).detail;
      setEnabled(detail === "all");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("gloam-consent", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gloam-consent", onCustom);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // First-party pageview beacon (no third-party until you plug GA/Plausible)
    const body = JSON.stringify({
      t: "pageview",
      path: window.location.pathname,
      ref: document.referrer || null,
      ts: Date.now(),
    });
    try {
      // Prefer sendBeacon; falls back silently
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/collect", blob);
      } else {
        void fetch("/api/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* ignore */
    }
  }, [enabled]);

  return null;
}
