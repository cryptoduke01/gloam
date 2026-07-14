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

export function OnboardingCard() {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    setState(loadOnboarding());
  }, []);

  const refresh = useCallback(() => {
    setState(loadOnboarding());
  }, []);

  if (!state || state.dismissed) return null;

  const remaining = ONBOARDING_STEPS.filter((s) => !state.done.includes(s.id));

  return (
    <div className="rounded-xl border border-lime/30 bg-lime/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            Start here · testnet
          </p>
          <p className="mt-1 font-display text-xl text-foreground">
            Four steps to the private path
          </p>
          <p className="mt-1 text-sm text-mute">
            Dev proving keys — play money only. Dismiss anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissOnboarding();
            refresh();
          }}
          className="text-xs text-mute hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      <ol className="mt-4 space-y-2">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = state.done.includes(step.id);
          const href =
            step.href === "external:faucet" ? FAUCET_URL : step.href;
          const external = step.href === "external:faucet";
          return (
            <li
              key={step.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                done
                  ? "border-line/60 bg-background/40 text-mute"
                  : "border-line bg-background"
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`font-medium ${
                    done ? "text-mute line-through" : "text-foreground"
                  }`}
                >
                  {i + 1}. {step.title}
                </p>
                <p className="text-xs text-mute">{step.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!done && (
                  <>
                    {external ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          markOnboardingStep(step.id);
                          refresh();
                        }}
                        className="inline-flex min-h-9 items-center rounded-md bg-lime px-3 text-xs font-semibold text-black"
                      >
                        Open
                      </a>
                    ) : (
                      <Link
                        href={href}
                        onClick={() => {
                          markOnboardingStep(step.id);
                          refresh();
                        }}
                        className="inline-flex min-h-9 items-center rounded-md bg-lime px-3 text-xs font-semibold text-black"
                      >
                        Go
                      </Link>
                    )}
                  </>
                )}
                {!done && (
                  <button
                    type="button"
                    onClick={() => {
                      markOnboardingStep(step.id);
                      refresh();
                    }}
                    className="inline-flex min-h-9 items-center rounded-md border border-line px-2 text-xs text-mute hover:text-foreground"
                  >
                    Done
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {remaining.length === 0 && (
        <p className="mt-3 text-sm text-foreground">
          Checklist complete.{" "}
          <button
            type="button"
            className="text-lime hover:underline"
            onClick={() => {
              dismissOnboarding();
              refresh();
            }}
          >
            Hide this card
          </button>
        </p>
      )}
    </div>
  );
}
