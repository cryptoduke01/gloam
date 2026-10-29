"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Ballot } from "@/lib/vote/core";
import type { VoteSummary } from "@/lib/vote/results";
import { Recount, ResultsCard, UpdatedAgo } from "./VoteParts";
import m from "./vote.module.css";

const noop = () => () => {};

/**
 * Live results in a sheet: up from the bottom on a phone, a panel on the
 * right on a computer. Escape or the close button shuts it, focus stays
 * inside while it is open and returns to the button that opened it.
 */
export function ResultsDrawer({
  votes,
  mine,
  updatedAt,
  open,
  onClose,
}: {
  votes: VoteSummary[];
  mine: (id: string) => Ballot | null;
  updatedAt: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onClose();
    setLeaving(true);
    window.setTimeout(() => {
      setLeaving(false);
      onClose();
    }, 170);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-stretch sm:justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" tabIndex={-1} aria-hidden="true" data-leaving={leaving} onClick={close} className="gl-backdrop absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div
        ref={panel}
        data-leaving={leaving}
        className="gl-sheet relative z-[1] flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-background shadow-pop sm:max-h-none sm:w-[520px] sm:rounded-none sm:rounded-l-[24px]"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-4 sm:px-7 sm:pt-7">
          <div>
            <h2 id="drawer-title" className="flex items-center gap-2.5 text-[22px] tracking-[-0.015em] text-foreground">
              <span aria-hidden className={`h-2 w-2 rounded-full bg-sealed ${m.live}`} />
              Live results
            </h2>
            <p className="mt-1">
              <UpdatedAgo at={updatedAt} />
            </p>
          </div>
          <button ref={closeBtn} type="button" onClick={close} aria-label="Close live results" className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-mute transition-colors hover:bg-surface hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <p className="px-1 text-[13.5px] leading-relaxed text-mute">
            {votes.some((v) => v.basis === "live" || v.basis === "counting")
              ? "Live, final weights are counted when the vote closes."
              : votes.some((v) => v.basis === "final")
                ? "Final, weighted by the $GLOAM each wallet held when voting closed."
                : "Weighted by $GLOAM at the snapshot."}{" "}
            The brighter bar leads; your answers are marked.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {votes.map((v) => (
              <ResultsCard key={v.id} s={v} mine={mine(v.id)} />
            ))}
          </div>
          <div className="mt-4">
            <Recount votes={votes} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The sticky button that opens the drawer. */
export function ResultsButton({ onOpen, wallets }: { onOpen: () => void; wallets: number }) {
  return (
    <div className={`${m.fab} pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:justify-end sm:px-7 sm:pb-7`}>
      <button
        type="button"
        onClick={onOpen}
        className="pointer-events-auto inline-flex min-h-12 items-center gap-2.5 rounded-full bg-ink px-5 text-[14.5px] font-medium text-on-ink shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transition-none"
      >
        <span aria-hidden className={`h-2 w-2 rounded-full bg-sealed ${m.live}`} />
        Live results
        <span className="tnum text-[13px] font-normal opacity-70">{wallets.toLocaleString("en-US")} {wallets === 1 ? "wallet" : "wallets"}</span>
      </button>
    </div>
  );
}
