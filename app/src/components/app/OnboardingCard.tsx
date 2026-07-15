"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FAUCET_URL } from "@/lib/faucet";
import {
  ONBOARDING_STEPS,
  dismissOnboarding,
  loadOnboarding,
  markOnboardingStep,
  type OnboardingState,
} from "@/lib/onboarding";

/**
 * Quiet “getting started” note — lives in the portfolio sidebar, not a hero banner.
 */
export function OnboardingCard({ compact = true }: { compact?: boolean }) {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    setState(loadOnboarding());
  }, []);

  const refresh = useCallback(() => {
    setState(loadOnboarding());
  }, []);

  if (!state || state.dismissed) return null;

  const remaining = ONBOARDING_STEPS.filter((s) => !state.done.includes(s.id));
  const next = remaining[0] ?? null;

  return (
    <aside
      className={`rounded-xl border border-line bg-panel text-sm ${
        compact ? "p-4" : "p-5"
      }`}
      aria-label="Getting started"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Side note · testnet
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {remaining.length === 0
              ? "You’re set"
              : "Getting started"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissOnboarding();
            refresh();
          }}
          className="shrink-0 text-[11px] text-mute hover:text-foreground"
          aria-label="Dismiss getting started"
        >
          Dismiss
        </button>
      </div>

      {remaining.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-mute">
          Vault path ready. Dismiss this note anytime.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-mute">
            {`${remaining.length} step${remaining.length === 1 ? "" : "s"} left for private hold & pay. Dev keys only.`}
          </p>
          <ol className="mt-3 space-y-1.5">
            {ONBOARDING_STEPS.map((step, i) => {
              const done = state.done.includes(step.id);
              const isNext = next?.id === step.id;
              return (
                <li
                  key={step.id}
                  className={`flex items-center justify-between gap-2 text-xs ${
                    done ? "text-mute line-through" : "text-foreground"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-mute">{i + 1}.</span> {step.title}
                  </span>
                  {!done && isNext && (
                    step.href === "external:faucet" ? (
                      <a
                        href={FAUCET_URL}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          markOnboardingStep(step.id);
                          refresh();
                        }}
                        className="shrink-0 text-lime hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <Link
                        href={step.href}
                        onClick={() => {
                          markOnboardingStep(step.id);
                          refresh();
                        }}
                        className="shrink-0 text-lime hover:underline"
                      >
                        Go
                      </Link>
                    )
                  )}
                  {!done && !isNext && (
                    <button
                      type="button"
                      onClick={() => {
                        markOnboardingStep(step.id);
                        refresh();
                      }}
                      className="shrink-0 text-[11px] text-mute hover:text-foreground"
                      aria-label={`Mark "${step.title}" done`}
                      title="Mark done"
                    >
                      Mark done
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </aside>
  );
}
