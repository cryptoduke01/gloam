"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppLink } from "./AppLink";
import { compactRemaining, remainingUntil, type Remaining } from "@/lib/mainnet";

/** Private stock swaps on Robinhood Chain open at this time. */
export const STOCKS_LIVE_MS = Date.parse("2026-10-27T12:00:00Z");

// Their own keys, so someone who closed the mainnet note still hears about stocks,
// and someone who closed the countdown still hears that they are live.
const KEY = "gloam:announce-dismissed:stocks-v1";
const LIVE_KEY = "gloam:announce-dismissed:stocks-live-v1";

// Keep the note on marketing + docs; stay out of the working app (it has its own notice).
const HIDDEN_ON = ["/app", "/admin", "/verify", "/pitch", "/claim", "/mainnet"];

const DISMISSED_EVENT = "gloam-announce-dismissed";

function subscribeDismissed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISSED_EVENT, onChange);
  };
}

/** "countdown closed" then "live note closed", one digit each, as this browser saved them. */
function dismissedSnapshot(): string {
  try {
    return `${localStorage.getItem(KEY) === "1" ? 1 : 0}${localStorage.getItem(LIVE_KEY) === "1" ? 1 : 0}`;
  } catch {
    return "00";
  }
}

const LAUNCHED: Remaining = remainingUntil(STOCKS_LIVE_MS, STOCKS_LIVE_MS);

/**
 * The time left to the stocks launch, ticking once a second. Before it, null
 * until mounted so the server and the first render agree; after it, done from
 * the first render, server included.
 */
function useStocksRemaining(): Remaining | null {
  const [r, setR] = useState<Remaining | null>(() => (Date.now() >= STOCKS_LIVE_MS ? LAUNCHED : null));
  useEffect(() => {
    if (Date.now() >= STOCKS_LIVE_MS) return;
    let id = 0;
    const tick = () => {
      const next = remainingUntil(Date.now(), STOCKS_LIVE_MS);
      setR(next);
      if (next.done) window.clearInterval(id);
    };
    id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, []);
  return r;
}

const linkClass =
  "shrink-0 text-[13px] font-medium text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white";

/** Slim site-wide private-stocks countdown, then the news that they are live. Dismissible per browser. */
export function AnnouncementBanner() {
  const pathname = usePathname();
  // The server can't see what this browser closed, so it renders the note.
  const stored = useSyncExternalStore(subscribeDismissed, dismissedSnapshot, () => "00");
  // Closed here, for when storage refuses the write.
  const [closed, setClosed] = useState<{ countdown: boolean; live: boolean }>({ countdown: false, live: false });
  const dismissed = { countdown: closed.countdown || stored[0] === "1", live: closed.live || stored[1] === "1" };
  const remaining = useStocksRemaining();
  const live = Boolean(remaining?.done);

  if (live ? dismissed.live : dismissed.countdown) return null;
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const dismiss = () => {
    try {
      localStorage.setItem(live ? LIVE_KEY : KEY, "1");
      window.dispatchEvent(new Event(DISMISSED_EVENT));
    } catch {
      /* ignore */
    }
    setClosed((d) => (live ? { ...d, live: true } : { ...d, countdown: true }));
  };

  return (
    <div className="relative z-[60] w-full border-b border-transparent bg-[#0b0c0e] text-white dark:border-line dark:bg-[#111214]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-3 px-4 py-2 sm:px-7">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8fd3ad]" />
        <p className="min-w-0 truncate text-[13px] leading-tight">
          {live ? (
            <>
              <span className="font-medium">Private stocks are live.</span>{" "}
              <span className="text-white/60 max-sm:hidden">Swap TSLA, NVDA, AAPL and more on Robinhood Chain from your private balance.</span>
            </>
          ) : (
            <>
              <span className="font-medium">Private stocks go live at 12:00 UTC.</span>{" "}
              {remaining && (
                <span className="text-white/60">
                  In <span className="tnum">{compactRemaining(remaining)}</span>
                </span>
              )}
            </>
          )}
        </p>
        {live ? (
          <AppLink href="/app/vault?tab=swap" className={linkClass}>
            Swap privately
          </AppLink>
        ) : (
          <Link href="/docs/private-swaps" className={linkClass}>
            How it works
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="absolute right-2 grid h-8 w-8 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white sm:right-4"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
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
