"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "./ThemeProvider";

/** Floating control (chat-widget position): bottom-right theme toggle */
export function ThemeDock() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] sm:bottom-6 sm:right-6">
      <motion.button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel text-foreground shadow-[var(--shadow-dock)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        initial={reduce ? false : { scale: 0.8, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        whileHover={reduce ? undefined : { scale: 1.08 }}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </motion.button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
