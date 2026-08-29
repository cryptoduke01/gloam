"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Success dialog portaled to document.body so AppShell `.rise` transforms
 * cannot pin fixed positioning mid-page.
 */
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
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
    >
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        className="relative z-[1] w-full max-w-sm max-h-[min(90vh,640px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
      >
        <div className="h-1 w-full bg-lime" />

        <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
          <motion.div
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-lime shadow-[0_0_40px_rgba(200,255,0,0.45)]"
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 18,
              delay: 0.05,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <motion.path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="#000"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: 0.45,
                  delay: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </svg>
          </motion.div>

          <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-lime">
            Confirmed
          </p>
          <h2
            id="success-title"
            className="mt-2 font-display text-3xl tracking-tight text-foreground"
          >
            {title}
          </h2>
          <div className="mt-3 max-w-xs text-sm leading-relaxed text-mute">
            {body}
          </div>

          <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row">
            {primaryHref && primaryLabel && (() => {
              const external =
                primaryHref.startsWith("http") ||
                primaryHref.startsWith("https");
              const cls =
                "inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-lime px-4 text-sm font-semibold text-black hover:opacity-90";
              if (external) {
                return (
                  <a
                    href={primaryHref}
                    target="_blank"
                    rel="noreferrer"
                    className={cls}
                  >
                    {primaryLabel}
                  </a>
                );
              }
              return (
                <Link href={primaryHref} onClick={onClose} className={cls}>
                  {primaryLabel}
                </Link>
              );
            })()}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-foreground hover:border-mute"
            >
              {secondaryLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
