"use client";

import { useEffect } from "react";

/**
 * Flags the whole document as "in the app" while any app route is mounted, so
 * the monochrome ink accent applies even to modals that portal to <body> (which
 * sit outside the .gloam-app subtree and would otherwise fall back to the
 * marketing indigo). Removed on unmount so the marketing site keeps its indigo.
 */
export function AppThemeScope() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("gloam-app-ctx");
    return () => el.classList.remove("gloam-app-ctx");
  }, []);
  return null;
}
