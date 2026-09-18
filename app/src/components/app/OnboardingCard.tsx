"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { FAUCET_URL } from "@/lib/faucet";
import {
  ONBOARDING_STEPS,
  dismissOnboarding,
  loadOnboarding,
  markOnboardingStep,
  type OnboardingState,
} from "@/lib/onboarding";

/** Fire this to open the getting-started modal from anywhere in the app. */
export const OPEN_ONBOARDING_EVENT = "gloam:open-onboarding";

export function openOnboarding() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT));
  }
}

/**
 * Getting-started guide as a first-run modal rather than an inline card. It
 * auto-opens once per session while steps remain and the note is not dismissed,
 * and can be reopened anytime via the "Getting started" link in the portfolio
 * strip (which dispatches OPEN_ONBOARDING_EVENT).
 */
export function OnboardingCard() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => setState(loadOnboarding()), []);

  // Load persisted state and auto-open once if there is unfinished setup.
  useEffect(() => {
    const s = loadOnboarding();
    setState(s);
    const remaining = ONBOARDING_STEPS.filter((x) => !s.done.includes(x.id));
    if (!s.dismissed && remaining.length > 0) setOpen(true);
  }, []);

  // Let any "Getting started" trigger reopen it (even after dismiss).
  useEffect(() => {
    const onOpen = () => {
      setState(loadOnboarding());
      setOpen(true);
    };
    window.addEventListener(OPEN_ONBOARDING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, onOpen);
  }, []);

  // Escape to close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!state || !open || typeof document === "undefined") return null;

  const remaining = ONBOARDING_STEPS.filter((s) => !state.done.includes(s.id));
  const next = remaining[0] ?? null;
  const doneCount = ONBOARDING_STEPS.length - remaining.length;

  // Portal to <body> so the fixed overlay centres in the viewport rather than
  // inside the app's transformed (.rise) content wrapper.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_60px_-20px_rgba(18,19,22,0.45)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <p className="text-lg font-semibold tracking-tight text-foreground">
            {remaining.length === 0 ? "You’re all set" : "Getting started"}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1.5 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-mute transition-colors hover:bg-background hover:text-foreground"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {remaining.length === 0 ? (
            <p className="text-sm leading-relaxed text-mute">
              Your private vault path is ready. Shield, pay, and prove a balance
              whenever you like.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-mute">
                <span>The private vault path, end to end.</span>
                <span className="tnum">
                  {doneCount}/{ONBOARDING_STEPS.length}
                </span>
              </div>
              <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-background">
                <span
                  className="h-full bg-lime transition-all"
                  style={{
                    width: `${(doneCount / ONBOARDING_STEPS.length) * 100}%`,
                  }}
                />
              </div>

              <ol className="mt-5 space-y-2.5">
                {ONBOARDING_STEPS.map((step, i) => {
                  const done = state.done.includes(step.id);
                  const isNext = next?.id === step.id;
                  return (
                    <li
                      key={step.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            done
                              ? "bg-lime text-background"
                              : isNext
                                ? "border border-lime text-foreground"
                                : "border border-line text-mute"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span
                          className={`truncate text-sm ${
                            done ? "text-mute line-through" : "text-foreground"
                          }`}
                        >
                          {step.title}
                        </span>
                      </span>
                      {!done &&
                        (isNext ? (
                          step.href === "external:faucet" ? (
                            <a
                              href={FAUCET_URL}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                markOnboardingStep(step.id);
                                refresh();
                              }}
                              className="shrink-0 rounded-lg bg-lime px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                            >
                              Open
                            </a>
                          ) : (
                            <Link
                              href={step.href}
                              onClick={() => {
                                markOnboardingStep(step.id);
                                setOpen(false);
                              }}
                              className="shrink-0 rounded-lg bg-lime px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                            >
                              Go
                            </Link>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              markOnboardingStep(step.id);
                              refresh();
                            }}
                            className="shrink-0 text-[11px] text-mute transition-colors hover:text-foreground"
                          >
                            Mark done
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3.5">
          <button
            type="button"
            onClick={() => {
              dismissOnboarding();
              refresh();
              setOpen(false);
            }}
            className="text-xs text-mute transition-colors hover:text-foreground"
          >
            Don’t show again
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-mute"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
