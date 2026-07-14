"use client";

import { useEffect } from "react";

export function SuccessModal({
  open,
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryLabel = "Done",
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-dock)]">
        <div className="border-b border-line bg-lime px-6 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/70">
            Success
          </p>
          <h2
            id="success-title"
            className="mt-1 font-display text-2xl tracking-tight text-black"
          >
            {title}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="text-sm leading-relaxed text-mute">{body}</div>
          <div className="flex flex-wrap gap-2">
            {primaryHref && primaryLabel && (
              <a
                href={primaryHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90"
              >
                {primaryLabel}
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-foreground hover:border-mute"
            >
              {secondaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
