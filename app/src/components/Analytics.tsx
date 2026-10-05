"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsAllowed,
  CONSENT_KEY,
  type ConsentValue,
} from "@/lib/consent";

/**
 * Lightweight first-party analytics. Marketing pageviews load only after
 * "Accept all"; essential-only sends nothing for them.
 *
 * Also counts opens of the proof verifier (/verify) as a product event, like
 * the in-app funnel events in lib/track: whether a proof came with the link,
 * never the proof itself.
 */
export function Analytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/verify") return;
    const hasProof = /[?#&]proof=/.test(window.location.search + window.location.hash);
    void import("@/lib/track").then(({ track }) => {
      track("verify_page_view", { hasProof });
    });
  }, [pathname]);

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
    void import("@/lib/track").then(({ trackPageview }) => {
      trackPageview();
    });
  }, [enabled]);

  return null;
}
