"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after client mount. Used to wrap components that call
 * Turnkey's useTurnkey(), whose provider has no context during SSR.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
