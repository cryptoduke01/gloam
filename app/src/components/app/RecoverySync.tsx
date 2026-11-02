"use client";

/**
 * Keeps the recovery backup following the balance on every app page, not only
 * the two that show it (lib/recovery). Draws nothing. Loaded apart from the page:
 * anything that changes before it starts goes up when it does.
 */
import { useEffect } from "react";

export function RecoverySync() {
  useEffect(() => {
    void import("@/lib/recovery").then(({ startRecoverySync }) => startRecoverySync());
  }, []);
  return null;
}
