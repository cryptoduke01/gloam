"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mark } from "@/components/Logo";
import { SealedField } from "@/components/ui/SealedField";

const STORAGE_KEY = "gloam_testnet_welcome_v1";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Dismiss welcome"
        onClick={dismiss}
      />
      <div className="relative z-[1] max-h-[min(90dvh,720px)] w-full max-w-[440px] overflow-y-auto rounded-[24px] border border-line bg-panel shadow-pop">
        <div className="relative overflow-hidden border-b border-line px-7 pb-6 pt-7">
          <SealedField tone="soft" />
          <div className="relative z-[1]">
            <div className="mb-6 max-sm:hidden">
              <Mark size={32} />
            </div>
            <p className="t-label">Gloam testnet</p>
            <h2 id="welcome-title" className="t-display-m mt-2 text-foreground">
              Welcome to Gloam
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-mute">
              Private money on Robinhood Chain and Tempo. This is a test version
              with play money, so don&apos;t use real funds.
            </p>
          </div>
        </div>

        <div className="px-7 pt-5">
          <p className="t-label">Quick start</p>
          <ol className="mt-2">
            {[
              <>Connect a wallet and pick a network: Robinhood Chain or Tempo.</>,
              <>
                Claim test funds if you need them. The{" "}
                <Link
                  href="/docs/testnet"
                  className="font-medium text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
                  onClick={dismiss}
                >
                  testnet guide
                </Link>{" "}
                shows how.
              </>,
              <>
                <span className="font-medium text-foreground">Add money</span>{" "}
                to your private balance, pay or send it, then cash out when you
                want it public.
              </>,
            ].map((body, i) => (
              <li
                key={i}
                className="flex gap-3.5 border-t border-line py-3 text-[14px] leading-relaxed text-soft first:border-t-0"
              >
                <span
                  aria-hidden
                  className="tnum mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-medium text-foreground"
                >
                  {i + 1}
                </span>
                <span>{body}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 flex gap-3 rounded-[14px] bg-surface px-4 py-3 text-[12.5px] leading-relaxed text-mute">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="mt-0.5 shrink-0 text-sealed"
            >
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            Your private balance lives in this browser. Save a backup in
            Settings before you clear your data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 px-7 pb-7 pt-5">
          <button
            type="button"
            onClick={dismiss}
            className="btn btn-ink h-[44px] flex-1 px-[20px] sm:h-12 sm:px-6 sm:text-[15px]"
          >
            Enter the app
          </button>
          <Link
            href="/docs/testnet"
            onClick={dismiss}
            className="btn btn-ghost h-[44px] px-[20px] sm:h-12 sm:px-6 sm:text-[15px]"
          >
            Testnet guide
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
