"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

/**
 * Renders children only after client mount. Used to wrap components that call
 * Turnkey's useTurnkey(), whose provider has no context during SSR.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return mounted ? <>{children}</> : null;
}
