"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Dismiss welcome"
        onClick={dismiss}
      />
      <div className="relative z-[1] w-full max-w-md max-h-[min(90vh,720px)] overflow-y-auto overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--lime)_18%,transparent),0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-line bg-background/60 px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-lime">
            Gloam testnet
          </p>
          <h2
            id="welcome-title"
            className="mt-2 font-display text-3xl tracking-tight text-foreground"
          >
            Welcome, you&apos;re live
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Private money on Robinhood Chain. Play money only. Dev proving keys.
            Don&apos;t use real funds.
          </p>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm text-mute">
          <p className="font-medium text-foreground">Quick path</p>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
            <li>Connect a wallet and switch to Robinhood testnet.</li>
            <li>
              Claim faucet ETH / stocks if needed, see the{" "}
              <Link
                href="/docs/testnet"
                className="text-lime underline-offset-2 hover:underline"
                onClick={dismiss}
              >
                testnet guide
              </Link>
              .
            </li>
            <li>
              <strong className="text-foreground">Shield ETH</strong> →{" "}
              <strong className="text-foreground">Trade → Private trade</strong>{" "}
              (size hidden) or <strong className="text-foreground">Move</strong>{" "}
              to pay / cash out.
            </li>
          </ol>
          <p className="text-xs leading-relaxed text-mute">
            Notes live in this browser. Export a backup in Settings before
            clearing site data.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-lime px-4 text-sm font-semibold text-background hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            Enter testnet
          </button>
          <Link
            href="/docs/testnet"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-foreground hover:border-mute"
          >
            Guide
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
