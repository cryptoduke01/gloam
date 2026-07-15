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
    // Dynamic import keeps consent gate in one place for product track() too
    void import("@/lib/track").then(({ track }) => {
      track("pageview");
    });
  }, [enabled]);

  return null;
}
