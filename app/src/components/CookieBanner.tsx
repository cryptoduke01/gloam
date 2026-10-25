"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getConsent, setConsent, subscribeConsent, type ConsentValue } from "@/lib/consent";
import { readDemo } from "@/lib/demoFlag";

const noopSubscribe = () => () => {};

export function CookieBanner() {
  // The server has no choice to read, so it renders nothing ("set").
  const consent = useSyncExternalStore<ConsentValue | "set" | null>(subscribeConsent, getConsent, () => "set");
  // Stays out of the way while recording the demo.
  const demo = useSyncExternalStore(noopSubscribe, readDemo, () => false);
  // Closes at once even where storage refuses the write (private mode).
  const [closed, setClosed] = useState(false);

  const accept = (value: ConsentValue) => {
    setConsent(value);
    setClosed(true);
  };

  if (consent !== null || demo || closed) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-3 left-3 right-3 z-50 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
    >
      <div className="rounded-[20px] border border-line bg-panel/95 p-4 shadow-pop backdrop-blur-xl sm:p-5">
        <p className="text-[14px] text-foreground max-sm:hidden">Cookies</p>
        {/* A phone gets the short version, so the banner stays a strip, not a third of the screen. */}
        <p className="text-[13px] leading-relaxed text-mute sm:hidden">
          No ad or tracking cookies. Essential only keeps what the site needs and a few anonymous totals. Accept all
          adds anonymous counts of visits and app steps.{" "}
          <Link href="/cookies" className="text-foreground underline underline-offset-2">
            More
          </Link>
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute max-sm:hidden">
          We set no ad or tracking cookies. Essential only keeps what the site
          needs to work, plus four anonymous claim-link totals and a one-way
          count of how many wallets use Gloam. Accept all
          turns on anonymous counts with no cookies: page views, visits and
          app steps.
          See{" "}
          <Link href="/cookies" className="text-foreground underline underline-offset-2">
            Cookies
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy
          </Link>
          .
        </p>
        <div className="mt-3 flex gap-2 sm:mt-4">
          <button
            type="button"
            onClick={() => accept("essential")}
            className="btn btn-ghost btn-sm flex-1"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => accept("all")}
            className="btn btn-ink btn-sm flex-1"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
