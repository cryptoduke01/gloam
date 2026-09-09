"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/app/trade?path=sealed", label: "Trade" },
  { href: "/app", label: "Vault" },
  { href: "/sdk", label: "SDK" },
  { href: "/docs", label: "Docs" },
  { href: "/whitepaper", label: "Whitepaper" },
];

/**
 * Mobile disclosure menu for the landing nav. The desktop nav hides its links
 * below `sm`; this gives small screens a real way to reach them. Light
 * "Twilight" palette to match Landing. Client-only for the toggle + Escape.
 */
export function LandingMobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#E5E3DD] bg-white/60 text-[#121316] transition-colors hover:border-[#cfccc4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        <>
          {/* click-away */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            id="landing-mobile-menu"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-52 overflow-hidden rounded-[14px] border border-[#E5E3DD] bg-white/95 p-1.5 shadow-[0_1px_2px_rgba(18,19,22,0.05),0_18px_44px_-20px_rgba(18,19,22,0.32)] backdrop-blur-xl"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-[9px] px-3 py-2.5 text-[15px] text-[#3a3a40] transition-colors hover:bg-[#F4F3EF] hover:text-[#121316]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
