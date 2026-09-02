"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { SdkObject } from "./SdkObject";

const KEY = "gloam:sdk-banner-dismissed:v1";

// Keep the launch banner on marketing + docs; stay out of the working app.
const HIDDEN_ON = ["/app", "/admin", "/verify"];

/**
 * Slim site-wide launch banner for the SDK. Ink bar with the animated SDK
 * object; dismissible per-browser. Renders on the server (no layout shift for
 * the common case) and hides after mount only if previously dismissed.
 */
export function AnnouncementBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setDismissed(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  if (dismissed) return null;
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className="relative z-[60] w-full bg-[#121316] text-[#F4F3EF]"
      style={{ ["--sdk-bg" as keyof CSSProperties]: "#121316" } as CSSProperties}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="shrink-0">
          <SdkObject size={24} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] leading-tight sm:text-[13.5px]">
          <span className="font-semibold">The Gloam SDK is live.</span>{" "}
          <span className="text-white/55">
            Add private balances, payments, and disclosure to any Robinhood Chain
            app.
          </span>
        </p>
        <Link
          href="/sdk"
          className="shrink-0 rounded-full border border-white/25 px-3 py-1 text-[12.5px] font-medium text-[#F4F3EF] transition-colors hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
        >
          Explore the SDK →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
