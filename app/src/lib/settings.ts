export type TradingSettings = {
  defaultSide: "buy" | "sell";
  marketFilter: "all" | "stock" | "meme" | "onchain";
  showUsd: boolean;
  hideZeroBalances: boolean;
  confirmSends: boolean;
  compactCharts: boolean;
  /**
   * Fast send: skip extra in-app steps; still requires one wallet confirm
   * (non-custodial — we never move funds without a signature).
   */
  fastSend: boolean;
};

export const DEFAULT_SETTINGS: TradingSettings = {
  defaultSide: "buy",
  marketFilter: "all",
  showUsd: true,
  hideZeroBalances: false,
  confirmSends: true,
  compactCharts: false,
  fastSend: false,
};

const KEY = "gloam_trading_settings";

export function loadSettings(): TradingSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: TradingSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
