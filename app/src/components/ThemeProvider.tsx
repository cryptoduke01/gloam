"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

type Theme = "light";

/**
 * Gloam runs light-only now (the "Twilight" brand). This provider just pins the
 * document to the light theme and keeps the old context API as light no-ops so
 * any `useTheme()` consumers keep working.
 */
const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}>({ theme: "light", toggle: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const d = document.documentElement;
    d.dataset.theme = "light";
    d.classList.add("light");
    d.classList.remove("dark");
    try {
      localStorage.setItem("gloam_theme", "light");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme: "light", toggle: () => {}, setTheme: () => {} }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
