"use client";

import { useEffect } from "react";

/**
 * Flags the whole document as "in the app" while any app route is mounted, so
 * the app ground (the soft neutral the cards float on) also reaches modals that
 * portal to <body>, which sit outside the .gloam-app subtree. Removed on
 * unmount so the marketing site keeps its plain paper ground.
 */
export function AppThemeScope() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("gloam-app-ctx");
    return () => el.classList.remove("gloam-app-ctx");
  }, []);
  return null;
}
