"use client";

import { useState } from "react";

/** A value that copies itself on click (hex codes, addresses). */
export function CopyValue({ value, className = "" }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
      className={`tnum inline-flex items-center gap-1.5 rounded-full px-2 py-1 -mx-2 transition-colors hover:bg-surface ${className}`}
      aria-label={`Copy ${value}`}
    >
      {done ? "Copied" : value}
    </button>
  );
}
