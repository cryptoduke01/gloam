"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type TradingSettings,
} from "@/lib/settings";

export function useTradingSettings() {
  const [settings, setSettingsState] = useState<TradingSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettingsState(loadSettings());
    setReady(true);
  }, []);

  const setSettings = useCallback((patch: Partial<TradingSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, setSettings, ready };
}
