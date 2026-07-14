export type TradingSettings = {
  defaultSide: "buy" | "sell";
  /** all | onchain (faucet tokens) | stocks (equity book) */
  marketFilter: "all" | "onchain" | "stocks";
  showUsd: boolean;
  hideZeroBalances: boolean;
  confirmSends: boolean;
  compactCharts: boolean;
  /**
   * Fast send: skip review step; still requires one wallet confirm.
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
    const parsed = {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(raw) as Partial<TradingSettings>),
    };
    const filter = String(
      (JSON.parse(raw) as { marketFilter?: string }).marketFilter ?? "all"
    );
    // migrate old filters
    if (filter === "meme" || filter === "stock") {
      parsed.marketFilter = "all";
    } else if (
      filter === "all" ||
      filter === "onchain" ||
      filter === "stocks"
    ) {
      parsed.marketFilter = filter;
    } else {
      parsed.marketFilter = "all";
    }
    return parsed;
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
